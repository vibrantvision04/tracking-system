package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/cache"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/decoder"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Pipeline struct {
	cfg         *config.Config
	rdb         *redis.Client
	batchWriter *BatchWriter
	locCache    *cache.LocationCache
	dispatcher  *Dispatcher
}

func NewPipeline(cfg *config.Config, rdb *redis.Client, bw *BatchWriter, lc *cache.LocationCache, d *Dispatcher) *Pipeline {
	return &Pipeline{
		cfg:         cfg,
		rdb:         rdb,
		batchWriter: bw,
		locCache:    lc,
		dispatcher:  d,
	}
}

func (p *Pipeline) Start() {
	log.Info().Msg("Starting GPS processing pipeline")

	// Create consumer group if not exists
	ctx := context.Background()
	p.rdb.XGroupCreateMkStream(ctx, "gps:stream", "workers", "0").Err()

	for i := 0; i < p.cfg.WorkerPoolSize; i++ {
		go p.worker(i)
	}
}

func (p *Pipeline) worker(id int) {
	ctx := context.Background()
	consumerName := fmt.Sprintf("worker-%d", id)

	for {
		streams, err := p.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    "workers",
			Consumer: consumerName,
			Streams:  []string{"gps:stream", ">"},
			Count:    10,
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if err != redis.Nil {
				log.Error().Err(err).Msg("Error reading from Redis Stream")
			}
			time.Sleep(100 * time.Millisecond) // Safety sleep to prevent tight-looping
			continue
		}

		for _, stream := range streams {
			for _, msg := range stream.Messages {
				p.processMessage(ctx, msg)
				p.rdb.XAck(ctx, "gps:stream", "workers", msg.ID)
			}
		}
	}
}

func (p *Pipeline) processMessage(ctx context.Context, msg redis.XMessage) {
	dataStr, ok := msg.Values["data"].(string)
	if !ok {
		log.Warn().Msg("Invalid data format in Redis message")
		return
	}

	// Try unmarshaling as a slice first (for batch ingestion)
	var records []decoder.AVLData
	if err := json.Unmarshal([]byte(dataStr), &records); err != nil {
		// If fails, try as a single record (legacy/single ingestion)
		var single decoder.AVLData
		if err := json.Unmarshal([]byte(dataStr), &single); err != nil {
			log.Error().Err(err).Msg("Failed to unmarshal AVLData from stream")
			return
		}
		records = []decoder.AVLData{single}
	}

	for _, data := range records {
		// 0. Ignore invalid GPS data (lat/lng = 0)
		if data.Lat == 0 && data.Lng == 0 {
			continue
		}

		// 1. Add to batch writer for DB insert
		p.batchWriter.Add(data)

		// 2. Update latest location cache
		if err := p.locCache.SetLatest(ctx, data); err != nil {
			log.Error().Err(err).Str("imei", data.IMEI).Msg("Failed to update location cache")
		}

		// 3. Dispatch to other services (WS, Geofence, etc.)
		p.dispatcher.Dispatch(ctx, data)
	}
}
