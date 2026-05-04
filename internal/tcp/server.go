package tcp

import (
	"fmt"
	"gps-tracking-system/internal/config"
	"net"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Server struct {
	cfg       *config.Config
	rdb       *redis.Client
	port      string
	semaphore chan struct{}
}

func NewServer(cfg *config.Config, rdb *redis.Client) *Server {
	return &Server{
		cfg:       cfg,
		rdb:       rdb,
		port:      cfg.GPSTCPPort,
		semaphore: make(chan struct{}, 50), // Limit to 50 concurrent connections
	}
}

func (s *Server) Start() error {
	addr := fmt.Sprintf(":%s", s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	defer listener.Close()

	log.Info().Msgf("GPS TCP Server listening on %s", addr)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Error().Err(err).Msg("Failed to accept connection")
			continue
		}

		// Use semaphore to limit goroutines
		s.semaphore <- struct{}{}
		go func(c net.Conn) {
			defer func() { <-s.semaphore }()
			s.handleConnection(c)
		}(conn)
	}
}
