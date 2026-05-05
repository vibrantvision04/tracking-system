package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // Allow all origins for dev
}

type Hub struct {
	rdb     *redis.Client
	clients map[*Client]bool
	mu      sync.Mutex
}

func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		rdb:     rdb,
		clients: make(map[*Client]bool),
	}
}

// ServeHTTP handles websocket requests from the peer.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Debug().
		Str("path", r.URL.Path).
		Interface("headers", r.Header).
		Msg("New WebSocket connection attempt")
	
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().
			Err(err).
			Str("remote", r.RemoteAddr).
			Interface("headers", r.Header).
			Msg("WebSocket upgrade failed")
		return
	}

	client := &Client{
		hub:             h,
		conn:            conn,
		send:            make(chan []byte, 256),
		subscribedIMEIs: make(map[string]bool),
	}
	h.Register(client)

	log.Info().Str("remote", conn.RemoteAddr().String()).Msg("WebSocket client connected")

	// Send initial snapshot of all known locations
	go func(c *Client) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		// 1. Fetch latest locations
		keys, err := h.rdb.Keys(ctx, "gps:latest:*").Result()
		var snapshot []json.RawMessage
		if err == nil && len(keys) > 0 {
			vals, err := h.rdb.MGet(ctx, keys...).Result()
			if err == nil {
				for _, val := range vals {
					if strVal, ok := val.(string); ok {
						snapshot = append(snapshot, json.RawMessage(strVal))
					}
				}
			}
		}

		// 2. Fetch device statuses
		statusKeys, _ := h.rdb.Keys(ctx, "gps:status:*").Result()
		statuses := make(map[string]string)
		if len(statusKeys) > 0 {
			sVals, _ := h.rdb.MGet(ctx, statusKeys...).Result()
			for i, val := range sVals {
				if strVal, ok := val.(string); ok {
					imei := statusKeys[i][len("gps:status:"):]
					statuses[imei] = strVal
				}
			}
		}
				
		payload, _ := json.Marshal(map[string]interface{}{
			"type": "snapshot",
			"data": snapshot,
			"statuses": statuses,
		})
				
				// Safe send to avoid blocking or panicking
				select {
				case c.send <- payload:
				case <-time.After(1 * time.Second):
					log.Warn().Msg("Timed out sending snapshot to client")
				}
	}(client)

	go client.writePump()
	go client.readPump()
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
		log.Info().Str("remote", c.conn.RemoteAddr().String()).Msg("WebSocket client disconnected")
	}
	h.mu.Unlock()
}

func (h *Hub) StartSubscriber(ctx context.Context) {
	pubsub := h.rdb.PSubscribe(ctx, "gps:live:*", "metadata:*")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		h.mu.Lock()
		for client := range h.clients {
			// In ISWM, we broadcast all vehicles to all admins
			select {
			case client.send <- []byte(msg.Payload):
			default:
				log.Warn().Msg("Client send buffer full")
			}
		}
		h.mu.Unlock()
	}
}
