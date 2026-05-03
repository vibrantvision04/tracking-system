package ws

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)



type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
	
	subscribedIMEIs map[string]bool
	mu              sync.RWMutex
}

func (c *Client) IsSubscribed(imei string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.subscribedIMEIs[imei]
}

func (c *Client) Subscribe(imeis []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, imei := range imeis {
		c.subscribedIMEIs[imei] = true
	}
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upgrade websocket")
		return
	}

	client := &Client{
		hub:             hub,
		conn:            conn,
		send:            make(chan []byte, 256),
		subscribedIMEIs: make(map[string]bool),
	}
	client.hub.Register(client)

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg struct {
			Action string   `json:"action"`
			IMEIs  []string `json:"imeis"`
		}
		if err := json.Unmarshal(message, &msg); err == nil && msg.Action == "subscribe" {
			c.Subscribe(msg.IMEIs)
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			w.Close()

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
