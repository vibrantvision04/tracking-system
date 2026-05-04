package worker

import (
	"context"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

type BatchWriter struct {
	repo         *repository.GPSRepository
	batchSize    int
	timeout      time.Duration
	buffer       []decoder.AVLData
	mu           sync.Mutex
	lastFlush    time.Time
	flushChannel chan struct{}
}

func NewBatchWriter(repo *repository.GPSRepository, size int, timeout time.Duration) *BatchWriter {
	bw := &BatchWriter{
		repo:         repo,
		batchSize:    size,
		timeout:      timeout,
		buffer:       make([]decoder.AVLData, 0, size),
		lastFlush:    time.Now(),
		flushChannel: make(chan struct{}, 1),
	}
	go bw.run()
	return bw
}

func (bw *BatchWriter) Add(data decoder.AVLData) {
	bw.mu.Lock()
	
	// HARD CEILING: Prevent buffer from growing infinitely if DB is slow
	if len(bw.buffer) >= 1000 {
		bw.mu.Unlock()
		log.Warn().Str("imei", data.IMEI).Msg("Batch writer buffer full, dropping record to prevent OOM")
		return
	}

	bw.buffer = append(bw.buffer, data)
	shouldFlush := len(bw.buffer) >= bw.batchSize
	bw.mu.Unlock()

	if shouldFlush {
		select {
		case bw.flushChannel <- struct{}{}:
		default:
		}
	}
}

func (bw *BatchWriter) run() {
	ticker := time.NewTicker(bw.timeout / 2)
	defer ticker.Stop()

	for {
		select {
		case <-bw.flushChannel:
			bw.flush()
		case <-ticker.C:
			if time.Since(bw.lastFlush) >= bw.timeout {
				bw.flush()
			}
		}
	}
}

func (bw *BatchWriter) flush() {
	bw.mu.Lock()
	if len(bw.buffer) == 0 {
		bw.mu.Unlock()
		return
	}
	dataToInsert := bw.buffer
	bw.buffer = make([]decoder.AVLData, 0, bw.batchSize)
	bw.lastFlush = time.Now()
	bw.mu.Unlock()

	err := bw.repo.BulkInsert(context.Background(), dataToInsert)
	if err != nil {
		log.Error().Err(err).Int("count", len(dataToInsert)).Msg("Failed to bulk insert GPS data")
	} else {
		log.Debug().Int("count", len(dataToInsert)).Msg("Successfully bulk inserted GPS data")
	}
}
