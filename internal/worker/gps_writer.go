package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/decoder"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type GPSWriter struct {
	cfg         *config.Config
	rdb         *redis.Client
	batchWriter *BatchWriter
}

func NewGPSWriter(cfg *config.Config, rdb *redis.Client, bw *BatchWriter) *GPSWriter {
	return &GPSWriter{
		cfg:         cfg,
		rdb:         rdb,
		batchWriter: bw,
	}
}

func (w *GPSWriter) Start() {
	log.Info().Msg("Starting GPS Writer worker (DB persistence)")

	// Create consumer group if not exists
	ctx := context.Background()
	w.rdb.XGroupCreateMkStream(ctx, "gps:stream", "db_writers", "0").Err()

	for i := 0; i < w.cfg.WorkerPoolSize; i++ {
		go w.worker(i)
	}
}

func (w *GPSWriter) worker(id int) {
	ctx := context.Background()
	consumerName := fmt.Sprintf("gps-writer-%d", id)

	for {
		streams, err := w.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    "db_writers",
			Consumer: consumerName,
			Streams:  []string{"gps:stream", ">"},
			Count:    10,
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if err != redis.Nil {
				log.Error().Err(err).Msg("GPS Writer: Error reading from Redis Stream")
			}
			time.Sleep(100 * time.Millisecond)
			continue
		}

		for _, stream := range streams {
			for _, msg := range stream.Messages {
				w.processMessage(ctx, msg)
				w.rdb.XAck(ctx, "gps:stream", "db_writers", msg.ID)
			}
		}
	}
}

func (w *GPSWriter) processMessage(ctx context.Context, msg redis.XMessage) {
	dataStr, ok := msg.Values["data"].(string)
	if !ok {
		return
	}

	var records []decoder.AVLData
	if err := json.Unmarshal([]byte(dataStr), &records); err != nil {
		var single decoder.AVLData
		if err := json.Unmarshal([]byte(dataStr), &single); err != nil {
			log.Error().Err(err).Msg("GPS Writer: Failed to unmarshal AVLData")
			return
		}
		records = []decoder.AVLData{single}
	}

	for _, data := range records {
		if data.Lat == 0 && data.Lng == 0 {
			continue
		}

		// Add to batch writer for DB insert
		w.batchWriter.Add(data)
	}
}
