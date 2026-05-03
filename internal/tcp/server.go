package tcp

import (
	"fmt"
	"gps-tracking-system/internal/config"
	"net"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Server struct {
	cfg   *config.Config
	rdb   *redis.Client
	port  string
}

func NewServer(cfg *config.Config, rdb *redis.Client) *Server {
	return &Server{
		cfg:  cfg,
		rdb:  rdb,
		port: cfg.GPSTCPPort,
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

		go s.handleConnection(conn)
	}
}
