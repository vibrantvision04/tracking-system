package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog/log"
)

type Config struct {
	GPSTCPPort                   string
	HTTPPort                     string
	WSPort                       string
	DBDSN                        string
	RedisURL                     string
	RedisAddr                    string
	RedisPassword                string
	JWTAccessSecret              string
	JWTRefreshSecret             string
	FrontendURL                  string
	WorkerPoolSize               int
	BatchSize                    int
	BatchTimeoutMS               int
	BatchBufferCeiling           int
	LogLevel                     string
	ReportCron                   string
	MaxPlaybackHours             int
	MaxPlaybackPoints            int
	RequireSequentialCheckpoints bool
	MaxCheckpointSpeedKmh        float64
	AllowHistoricalRecalculation bool
	ReportTemplatePath           string
}

func LoadConfig() *Config {
	err := godotenv.Load()
	if err != nil {
		log.Warn().Msg("No .env file found, using system environment variables")
	}

	gpsTcpPort := getEnv("GPS_TCP_PORT", "5027")

	httpPort := getEnv("PORT", "8080")
	if httpPort == gpsTcpPort {
		httpPort = getEnv("HTTP_PORT", "8080")
	}

	frontendURL := getEnv("FRONTEND_URL", "http://localhost:3000,http://localhost:5173,http://localhost:8080")

	return &Config{
		GPSTCPPort:                   gpsTcpPort,
		HTTPPort:                     httpPort,
		WSPort:                       getEnv("WS_PORT", "8081"),
		DBDSN:                        getEnv("DB_DSN", "postgres://gps:password@localhost:5432/gpsdb"),
		RedisURL:                     getEnv("REDISURL", getEnv("REDIS_URL", "")),
		RedisAddr:                    getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:                getEnv("REDIS_PASSWORD", ""),
		JWTAccessSecret:              getEnv("JWT_ACCESS_SECRET", "change-me-access-secret-min-32-chars"),
		JWTRefreshSecret:             getEnv("JWT_REFRESH_SECRET", "change-me-refresh-secret-min-32-chars"),
		FrontendURL:                  frontendURL,
		WorkerPoolSize:               getEnvInt("WORKER_POOL_SIZE", 8),
		BatchSize:                    getEnvInt("BATCH_SIZE", 200),
		BatchTimeoutMS:               getEnvInt("BATCH_TIMEOUT_MS", 5000),
		BatchBufferCeiling:           getEnvInt("BATCH_BUFFER_CEILING", 5000),
		LogLevel:                     getEnv("LOG_LEVEL", "info"),
		ReportCron:                   getEnv("REPORT_CRON", "5 0 * * *"),
		MaxPlaybackHours:             getEnvInt("MAX_PLAYBACK_HOURS", 24),
		MaxPlaybackPoints:            getEnvInt("MAX_PLAYBACK_POINTS", 5000),
		RequireSequentialCheckpoints: getEnvBool("REQUIRE_SEQUENTIAL_CHECKPOINTS", false),
		MaxCheckpointSpeedKmh:        getEnvFloat("MAX_CHECKPOINT_SPEED_KMH", 10.0),
		AllowHistoricalRecalculation: true,
		ReportTemplatePath:           getTemplatePath(),
	}
}

func getTemplatePath() string {
	path := getEnv("REPORT_TEMPLATE_PATH", "./storage/report-templates")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		fallback := "../../storage/report-templates"
		if _, err := os.Stat(fallback); err == nil {
			return fallback
		}
	}
	return path
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

func getEnvBool(key string, fallback bool) bool {
	if value, ok := os.LookupEnv(key); ok {
		b, err := strconv.ParseBool(value)
		if err != nil {
			return fallback
		}
		return b
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if value, ok := os.LookupEnv(key); ok {
		f, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fallback
		}
		return f
	}
	return fallback
}
