package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog/log"
)

type Config struct {
	GPSTCPPort        string
	HTTPPort          string
	WSPort            string
	DBDSN             string
	RedisURL          string
	RedisAddr         string
	RedisPassword     string
	JWTSecret         string
	WorkerPoolSize    int
	BatchSize         int
	BatchTimeoutMS    int
	LogLevel          string
	ReportCron        string
	MaxPlaybackHours  int
	MaxPlaybackPoints int
}

func LoadConfig() *Config {
	err := godotenv.Load()
	if err != nil {
		log.Warn().Msg("No .env file found, using system environment variables")
	}

	gpsTcpPort := getEnv("GPS_TCP_PORT", "5027")

	// Restore the HTTP_PORT fallback to prevent collisions with the GPS TCP port.
	// Railway injects PORT=5027 because of the TCP proxy, so we use HTTP_PORT
	// as an override to bind the web server to 8080 instead.
	httpPort := getEnv("HTTP_PORT", getEnv("PORT", "8080"))
	if httpPort == gpsTcpPort {
		httpPort = "8080"
		log.Warn().Msgf("Collision detected: PORT is %s (TCP port). Falling back to 8080 for HTTP.", gpsTcpPort)
	}

	return &Config{
		GPSTCPPort:        gpsTcpPort,
		HTTPPort:          httpPort,
		WSPort:            getEnv("WS_PORT", "8081"),
		DBDSN:             getEnv("DB_DSN", "postgres://gps:password@localhost:5432/gpsdb"),
		RedisURL:          getEnv("REDISURL", getEnv("REDIS_URL", "")),
		RedisAddr:         getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		JWTSecret:         getEnv("JWT_SECRET", "your-super-secret-key-here"),
		WorkerPoolSize:    getEnvInt("WORKER_POOL_SIZE", 2),
		BatchSize:         getEnvInt("BATCH_SIZE", 100),
		BatchTimeoutMS:    getEnvInt("BATCH_TIMEOUT_MS", 5000),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		ReportCron:        getEnv("REPORT_CRON", "5 0 * * *"),
		MaxPlaybackHours:  getEnvInt("MAX_PLAYBACK_HOURS", 24),
		MaxPlaybackPoints: getEnvInt("MAX_PLAYBACK_POINTS", 5000),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		i, err := strconv.Atoi(value)
		if err != nil {
			return fallback
		}
		return i
	}
	return fallback
}
