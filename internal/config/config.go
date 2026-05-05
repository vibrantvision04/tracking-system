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

	// Railway expects the HTTP server to listen on the port defined by the PORT environment variable.
	httpPort := getEnv("PORT", "8080")
	if httpPort == gpsTcpPort {
		log.Warn().Msgf("DANGER: Railway is asking the HTTP server to listen on %s, which is the TCP port! This will crash or break routing.", httpPort)
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
