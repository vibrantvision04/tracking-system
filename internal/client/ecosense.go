package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"sync"
	"time"
)

// Location represents the vehicle's coordinates.
type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// Vehicle struct mapped to the expected GPS data format.
type Vehicle struct {
	ID            string    `json:"_id"`
	Number        string    `json:"number"`
	Category      string    `json:"category"`
	LastLocation  Location  `json:"lastLocation"`
	TotalDistance float64   `json:"totalDistance"`
	Battery       float64   `json:"battery"`
	Ignition      bool      `json:"ignition"`
	DeviceTime    time.Time `json:"deviceTime"`
	LastSpeed     float64   `json:"lastSpeed"`
	Motion        bool      `json:"motion"`
	Active        bool      `json:"active"`
	Idle          bool      `json:"idle"`
	FuelType      string    `json:"fuelType"`
	Capacity      string    `json:"capacity"`
	Coverage      float64   `json:"coverage"`
}

// LoginResponse handles extracting the token or access token.
type LoginResponse struct {
	Code        int    `json:"code"`
	Message     string `json:"message"`
	Data        struct {
		Token       string `json:"token"`
		AccessToken string `json:"accessToken"`
		ProjectID   string `json:"projectId"`
	} `json:"data"`
}

// VehiclesResponse is the response format for the fetch vehicles endpoint.
type VehiclesResponse struct {
	Code    int       `json:"code"`
	Message string    `json:"message"`
	Data    []Vehicle `json:"data"`
}

type EcoSenseClient struct {
	httpClient *http.Client
	token      string
	projectID  string
	mu         sync.RWMutex
}

// NewEcoSenseClient configures the client with an explicit cookie jar.
func NewEcoSenseClient() *EcoSenseClient {
	jar, _ := cookiejar.New(nil)
	return &EcoSenseClient{
		httpClient: &http.Client{
			Jar:     jar,
			Timeout: 15 * time.Second,
		},
	}
}

// Start begins the auto-refresh ticker in the background.
func (c *EcoSenseClient) Start(ctx context.Context) {
	// Initial login
	if err := c.Login(); err != nil {
		fmt.Printf("Initial login failed: %v\n", err)
	}

	// 11-hour auto-refresh interval
	ticker := time.NewTicker(11 * time.Hour)
	go func() {
		for {
			select {
			case <-ticker.C:
				if err := c.Login(); err != nil {
					fmt.Printf("Background login failed: %v\n", err)
				}
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

// Login handles the authentication, cookie caching, and token extraction dynamically.
func (c *EcoSenseClient) Login() error {
	url := "https://app.ecosense-enviro.com/api/users/login?accessControlListFormatted=true&accessControlListEncrypted=false"

	payload := map[string]string{
		"email":    "urbanenviro",
		"password": "Urban@1223",
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

	var loginResp LoginResponse
	if err := json.Unmarshal(bodyBytes, &loginResp); err != nil {
		return fmt.Errorf("failed to unmarshal login response: %w", err)
	}

	// Store the token and projectId using RW mutex protection
	c.mu.Lock()
	defer c.mu.Unlock()

	if loginResp.Data.Token != "" {
		c.token = loginResp.Data.Token
	} else if loginResp.Data.AccessToken != "" {
		c.token = loginResp.Data.AccessToken
	}
	
	if loginResp.Data.ProjectID != "" {
		c.projectID = loginResp.Data.ProjectID
	}
	// If it only relies on cookies, cookiejar handled it implicitly above.

	return nil
}

// FetchVehicles dynamically attaches Bearer token if found, and uses the cookie jar to get data.
// If the token is expired (401/403), it will automatically re-login and retry exactly once.
func (c *EcoSenseClient) FetchVehicles() ([]Vehicle, error) {
	vehicles, err := c.doFetchVehicles()
	
	// If unauthorized, re-login and retry exactly once
	if err != nil && (err.Error() == "unauthorized" || err.Error() == "forbidden") {
		fmt.Println("Ecosense token expired or unauthorized, automatically re-authenticating...")
		if loginErr := c.Login(); loginErr != nil {
			return nil, fmt.Errorf("auto re-login failed: %w", loginErr)
		}
		// Retry fetch with the new token
		return c.doFetchVehicles()
	}

	return vehicles, err
}

func (c *EcoSenseClient) doFetchVehicles() ([]Vehicle, error) {
	url := "https://app.ecosense-enviro.com/api/vehicles?minifiedFor=monitoring"

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create fetch vehicles request: %w", err)
	}

	c.mu.RLock()
	token := c.token
	projectID := c.projectID
	c.mu.RUnlock()

	// Append token dynamically if we found one
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if projectID != "" {
		req.Header.Set("projectId", projectID)
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

	var vehiclesResp VehiclesResponse
	if err := json.Unmarshal(bodyBytes, &vehiclesResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal vehicles response: %w", err)
	}

	return vehiclesResp.Data, nil
}
