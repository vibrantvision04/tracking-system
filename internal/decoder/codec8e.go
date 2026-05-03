package decoder

import (
	"encoding/binary"
	"fmt"
	"time"
)

// DecodeCodec8E decodes a Teltonika Codec 8 Extended packet.
func DecodeCodec8E(imei string, data []byte) ([]AVLData, error) {
	if len(data) < 15 {
		return nil, fmt.Errorf("packet too short")
	}

	codecID := data[8]
	if codecID != 0x8E {
		return nil, fmt.Errorf("unsupported codec: %02X", codecID)
	}

	recordCount := int(data[9])
	records := make([]AVLData, 0, recordCount)
	offset := 10

	for i := 0; i < recordCount; i++ {
		if offset+15 > len(data) {
			break
		}

		timestamp := int64(binary.BigEndian.Uint64(data[offset : offset+8]))
		offset += 8
		priority := data[offset]
		offset += 1

		lng := float64(int32(binary.BigEndian.Uint32(data[offset:offset+4]))) / 10000000.0
		offset += 4
		lat := float64(int32(binary.BigEndian.Uint32(data[offset:offset+4]))) / 10000000.0
		offset += 4
		alt := float64(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		heading := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		satellites := int(data[offset])
		offset += 1
		speed := float64(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2

		// IO Elements in Codec8E
		io := make(map[uint16]interface{})
		eventID := binary.BigEndian.Uint16(data[offset : offset+2])
		offset += 2
		
		totalIO := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2

		// 1-byte IO
		count1 := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		for j := 0; j < count1; j++ {
			id := binary.BigEndian.Uint16(data[offset : offset+2])
			val := data[offset+2]
			io[id] = val
			offset += 3
		}

		// 2-byte IO
		count2 := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		for j := 0; j < count2; j++ {
			id := binary.BigEndian.Uint16(data[offset : offset+2])
			val := binary.BigEndian.Uint16(data[offset+2 : offset+4])
			io[id] = val
			offset += 4
		}

		// 4-byte IO
		count4 := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		for j := 0; j < count4; j++ {
			id := binary.BigEndian.Uint16(data[offset : offset+2])
			val := binary.BigEndian.Uint32(data[offset+2 : offset+6])
			io[id] = val
			offset += 6
		}

		// 8-byte IO
		count8 := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		for j := 0; j < count8; j++ {
			id := binary.BigEndian.Uint16(data[offset : offset+2])
			val := binary.BigEndian.Uint64(data[offset+2 : offset+10])
			io[id] = val
			offset += 10
		}

		// Variable length IO (X bytes) - Codec8E specific
		countX := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		offset += 2
		for j := 0; j < countX; j++ {
			id := binary.BigEndian.Uint16(data[offset : offset+2])
			length := int(binary.BigEndian.Uint16(data[offset+2 : offset+4]))
			val := data[offset+4 : offset+4+length]
			io[id] = val
			offset += 4 + length
		}

		// Ignition is usually IO 239
		ignition := false
		if val, ok := io[239]; ok {
			if v, ok2 := val.(uint8); ok2 {
				ignition = v == 1
			}
		}

		records = append(records, AVLData{
			IMEI:       imei,
			Time:       time.Unix(0, timestamp*int64(time.Millisecond)),
			Priority:   priority,
			Lat:        lat,
			Lng:        lng,
			Altitude:   alt,
			Heading:    heading,
			Satellites: satellites,
			Speed:      speed,
			Ignition:   ignition,
			IO:         io,
		})
		_ = eventID
		_ = totalIO
	}

	return records, nil
}
