package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// LoginRateLimitMiddleware returns a middleware that rate-limits by IP via Redis.
// limit requests per window per IP.
func LoginRateLimitMiddleware(rdb *redis.Client, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			key := "rl:login:" + ip
			now := time.Now().Unix()
			windowSec := int64(window.Seconds())

			pipe := rdb.Pipeline()
			pipe.ZRemRangeByScore(context.Background(), key, "0", strconv.FormatInt(now-windowSec, 10))
			countCmd := pipe.ZCard(context.Background(), key)
			pipe.ZAdd(context.Background(), key, redis.Z{Score: float64(now), Member: now})
			pipe.Expire(context.Background(), key, window)
			_, _ = pipe.Exec(context.Background())

			if countCmd.Val() >= int64(limit) {
				RespondWithError(w, http.StatusTooManyRequests, "Too many login attempts. Try again later.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
