package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/redis/go-redis/v9"
)

func sseMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		next.ServeHTTP(w, r)
		flusher.Flush()
	})
}

func SSESubscribe(rdb *redis.Client, channel string) http.Handler {
	return sseMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		flusher, _ := w.(http.Flusher)

		pubsub := rdb.Subscribe(ctx, channel)
		defer pubsub.Close()

		ch := pubsub.Channel()

		fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
		flusher.Flush()

		for {
			select {
			case msg := <-ch:
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", channel, msg.Payload)
				flusher.Flush()
			case <-ctx.Done():
				return
			}
		}
	}))
}

func (h *Handler) publishOpenDepotEvent(ctx context.Context, depotID int) {
	payload := map[string]interface{}{
		"depot_id": depotID,
	}
	data, _ := json.Marshal(payload)
	h.rdb.Publish(ctx, "open-depot:events", data)
}
