package tcp

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"gps-tracking-system/internal/decoder"
	"io"
	"net"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()

	// Set initial read deadline for handshake
	conn.SetReadDeadline(time.Now().Add(300 * time.Second))

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

	// 3. Receive AVL packets (Infinite Loop)
	for {
		// Read preamble (4 bytes of zeros)
		preamble := make([]byte, 4)
		_, err := io.ReadFull(conn, preamble)
		if err != nil {
			if err != io.EOF {
				log.Error().Err(err).Str("imei", imei).Msg("Failed to read packet preamble")
			}
			break
		}

		// VALIDATION: Teltonika packets MUST start with 4 zeros
		if binary.BigEndian.Uint32(preamble) != 0 {
			log.Error().Hex("preamble", preamble).Str("imei", imei).Msg("Invalid preamble, out of sync. Closing connection.")
			break
		}

		// Read data length (4 bytes)
		lenBuf := make([]byte, 4)
		_, err = io.ReadFull(conn, lenBuf)
		if err != nil {
			log.Error().Err(err).Str("imei", imei).Msg("Failed to read packet length")
			break
		}
		dataLen := binary.BigEndian.Uint32(lenBuf)

		// SAFETY CHECK: Limit max packet size to 128KB to prevent OOM
		if dataLen > 128*1024 {
			log.Error().Uint32("len", dataLen).Str("imei", imei).Msg("Packet too large, closing connection to prevent OOM")
			break
		}

		// Read data (codec + records)
		data := make([]byte, dataLen)
		_, err = io.ReadFull(conn, data)
		if err != nil {
			log.Error().Err(err).Str("imei", imei).Msg("Failed to read packet data")
			break
		}

		// Read CRC (4 bytes)
		crcBuf := make([]byte, 4)
		_, err = io.ReadFull(conn, crcBuf)
		if err != nil {
			log.Error().Err(err).Str("imei", imei).Msg("Failed to read packet CRC")
			break
		}

		// Construct full packet for decoder
		packet := make([]byte, 0, 8+dataLen+4)
		packet = append(packet, preamble...)
		packet = append(packet, lenBuf...)
		packet = append(packet, data...)
		packet = append(packet, crcBuf...)

		log.Debug().Str("imei", imei).Uint32("dataLen", dataLen).Msg("Received full AVL packet")

		if dataLen == 0 {
			log.Warn().Str("imei", imei).Msg("Received empty AVL data, skipping")
			continue
		}

		// Decode based on codec
		codecID := data[0] // Codec ID is the first byte of data
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

		log.Info().Str("imei", imei).Int("records", len(records)).Msg("Successfully decoded AVL records")
		conn.SetReadDeadline(time.Now().Add(300 * time.Second))

		// 4. Push to Redis Stream (Batch)
		s.pushBatchToStream(records)

		// 5. Send ACK (4-byte record count)
		ack := make([]byte, 4)
		binary.BigEndian.PutUint32(ack, uint32(len(records)))
		conn.Write(ack)
	}
}

func (s *Server) pushBatchToStream(data []decoder.AVLData) {
	if len(data) == 0 {
		return
	}

	ctx := context.Background()
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal AVLData batch")
		return
	}

	err = s.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: "gps:stream",
		MaxLen: 1000, // Reduced from 5000 to save even more shared memory
		Approx: true,
		Values: map[string]interface{}{
			"data": jsonData,
		},
	}).Err()

	if err != nil {
		log.Error().Err(err).Msg("Failed to add batch to Redis Stream")
	}
}
