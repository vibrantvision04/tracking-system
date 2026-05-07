package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

type AcceldashLoginResponse struct {
	Data struct {
		Token string `json:"token"`
	} `json:"data"`
	Message    string `json:"message"`
	StatusCode int    `json:"status_code"`
	Success    bool   `json:"success"`
}

type AcceldashGpsDatum struct {
	IMEI           string    `json:"imei"`
	Datetime       time.Time `json:"datetime"`
	Lat            float64   `json:"lat"`
	Lng            float64   `json:"lng"`
	Speed          float64   `json:"speed"`
	IgnitionStatus int       `json:"ignition_status"` // 0 or 1
}

type AcceldashGpsDevice struct {
	IMEINo   string              `json:"imei_no"`
	GpsDatum []AcceldashGpsDatum `json:"gpsdatum"`
}

type AcceldashVehicle struct {
	ID             int                  `json:"id"`
	RegistrationNo string               `json:"registration_no"`
	GpsDevices     []AcceldashGpsDevice `json:"gps_devices"`
}

type AcceldashVehiclesResponse struct {
	Data       interface{} `json:"data"` // Can be []AcceldashVehicle or map[string]AcceldashVehicle
	Success    bool        `json:"success"`
	StatusCode int         `json:"status_code"`
}

type AcceldashClient struct {
	httpClient *http.Client
	token      string
	mu         sync.RWMutex
}

func NewAcceldashClient() *AcceldashClient {
	return &AcceldashClient{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *AcceldashClient) Start(ctx context.Context) {
	if err := c.Login(); err != nil {
		fmt.Printf("Acceldash initial login failed: %v\n", err)
	}

	// Token refresh interval (e.g. 11 hours)
	ticker := time.NewTicker(11 * time.Hour)
	go func() {
		for {
			select {
			case <-ticker.C:
				if err := c.Login(); err != nil {
					fmt.Printf("Acceldash background login failed: %v\n", err)
				}
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

func (c *AcceldashClient) Login() error {
	url := "https://iswm-jaipur-heritage-api.acceldash.com/api/v1/login"
	payload := map[string]string{
		"email":    "superadmin@jaipurheritage.swm",
		"password": "BA@Jaipur25#",
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal login payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("login failed with status code: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	var loginResp AcceldashLoginResponse
	if err := json.Unmarshal(bodyBytes, &loginResp); err != nil {
		return fmt.Errorf("failed to unmarshal login response: %w", err)
	}

	if loginResp.Data.Token == "" {
		return fmt.Errorf("no token found in response")
	}

	c.mu.Lock()
	c.token = loginResp.Data.Token
	c.mu.Unlock()

	return nil
}

func (c *AcceldashClient) FetchVehicles() ([]AcceldashVehicle, error) {
	vehicles, err := c.doFetchVehicles()
	if err != nil && (err.Error() == "unauthorized" || err.Error() == "forbidden") {
		fmt.Println("Acceldash token expired or unauthorized, re-authenticating...")
		if loginErr := c.Login(); loginErr != nil {
			return nil, fmt.Errorf("auto re-login failed: %w", loginErr)
		}
		return c.doFetchVehicles()
	}
	return vehicles, err
}

func (c *AcceldashClient) doFetchVehicles() ([]AcceldashVehicle, error) {
	url := "https://iswm-jaipur-heritage-api.acceldash.com/api/v1/all_vehicles/"

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create fetch vehicles request: %w", err)
	}

	c.mu.RLock()
	token := c.token
	c.mu.RUnlock()

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch vehicles request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("unauthorized")
	}
	if resp.StatusCode == 403 {
		return nil, fmt.Errorf("forbidden")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch vehicles failed with status code: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read vehicles response body: %w", err)
	}

	var wrapper AcceldashVehiclesResponse
	if err := json.Unmarshal(bodyBytes, &wrapper); err != nil {
		return nil, fmt.Errorf("failed to unmarshal wrapper: %w", err)
	}

	// Now we need to extract vehicles from wrapper.Data
	var vehicles []AcceldashVehicle

	// Try unmarshaling Data as a slice
	dataBytes, _ := json.Marshal(wrapper.Data)
	if err := json.Unmarshal(dataBytes, &vehicles); err == nil {
		return vehicles, nil
	}

	// Try unmarshaling Data as a map
	var vehicleMap map[string]AcceldashVehicle
	if err := json.Unmarshal(dataBytes, &vehicleMap); err == nil {
		for _, v := range vehicleMap {
			vehicles = append(vehicles, v)
		}
		return vehicles, nil
	}

	return nil, fmt.Errorf("could not parse vehicles from data field")
}
