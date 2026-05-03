package tcp

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"gps-tracking-system/internal/decoder"
	"io"
	"net"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()

	// 1. Read IMEI (first 15-17 bytes usually)
	// Teltonika protocol: 2 bytes length, then IMEI string
	lenBuf := make([]byte, 2)
	_, err := io.ReadFull(conn, lenBuf)
	if err != nil {
		return
	}

	imeiLen := binary.BigEndian.Uint16(lenBuf)
	imeiBuf := make([]byte, imeiLen)
	_, err = io.ReadFull(conn, imeiBuf)
	if err != nil {
		return
	}

	imei := string(imeiBuf)
	log.Info().Str("imei", imei).Msg("New device connected")

	// 2. Send acceptance (01)
	conn.Write([]byte{0x01})

	// 3. Receive AVL packets
	buf := make([]byte, 4096)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Error().Err(err).Str("imei", imei).Msg("Connection read error")
			}
			break
		}

		packet := buf[:n]
		if len(packet) < 12 {
			continue
		}

		// Decode based on codec
		codecID := packet[8]
		var records []decoder.AVLData
		var decodeErr error

		if codecID == 0x08 {
			records, decodeErr = decoder.DecodeCodec8(imei, packet)
		} else if codecID == 0x8E {
			records, decodeErr = decoder.DecodeCodec8E(imei, packet)
		} else {
			log.Warn().Str("imei", imei).Hex("codec", []byte{codecID}).Msg("Unsupported codec")
			continue
		}

		if decodeErr != nil {
			log.Error().Err(decodeErr).Str("imei", imei).Msg("Failed to decode packet")
			continue
		}

		// 4. Push to Redis Stream
		for _, rec := range records {
			s.pushToStream(rec)
		}

		// 5. Send ACK (4-byte record count)
		ack := make([]byte, 4)
		binary.BigEndian.PutUint32(ack, uint32(len(records)))
		conn.Write(ack)
	}
}

func (s *Server) pushToStream(data decoder.AVLData) {
	ctx := context.Background()
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal AVLData")
		return
	}

	err = s.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: "gps:stream",
		MaxLen: 100000,
		Approx: true,
		Values: map[string]interface{}{
			"data": jsonData,
		},
	}).Err()

	if err != nil {
		log.Error().Err(err).Msg("Failed to add to Redis Stream")
	}
}
