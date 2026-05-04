package decoder

import (
	"encoding/binary"
	"fmt"
	"time"
)

// DecodeCodec8 decodes a Teltonika Codec 8 packet.
func DecodeCodec8(imei string, data []byte) ([]AVLData, error) {
	if len(data) < 15 {
		return nil, fmt.Errorf("packet too short")
	}

	// 0-3: Preamble (00000000)
	// 4-7: Data Length
	// 8: Codec ID (08)
	codecID := data[8]
	if codecID != 0x08 {
		return nil, fmt.Errorf("unsupported codec: %02X", codecID)
	}

	recordCount := int(data[9])
	if recordCount > 255 {
		return nil, fmt.Errorf("too many records in one packet: %d", recordCount)
	}
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

		// IO Elements
		io := make(map[uint16]interface{})
		eventID := binary.BigEndian.Uint16([]byte{0, data[offset]}) // Codec8 has 1-byte event ID
		offset += 1
		
		totalIO := int(data[offset])
		offset += 1

		// 1-byte IO
		count1 := int(data[offset])
		offset += 1
		for j := 0; j < count1; j++ {
			id := uint16(data[offset])
			val := data[offset+1]
			io[id] = val
			offset += 2
		}

		// 2-byte IO
		count2 := int(data[offset])
		offset += 1
		for j := 0; j < count2; j++ {
			id := uint16(data[offset])
			val := binary.BigEndian.Uint16(data[offset+1 : offset+3])
			io[id] = val
			offset += 3
		}

		// 4-byte IO
		count4 := int(data[offset])
		offset += 1
		for j := 0; j < count4; j++ {
			id := uint16(data[offset])
			val := binary.BigEndian.Uint32(data[offset+1 : offset+5])
			io[id] = val
			offset += 5
		}

		// 8-byte IO
		count8 := int(data[offset])
		offset += 1
		for j := 0; j < count8; j++ {
			id := uint16(data[offset])
			val := binary.BigEndian.Uint64(data[offset+1 : offset+9])
			io[id] = val
			offset += 9
		}

		// Odometer (IO 16)
		var odometer int64 = 0
		if val, ok := io[16]; ok {
			if v, ok2 := val.(uint32); ok2 {
				odometer = int64(v)
			} else if v, ok2 := val.(uint64); ok2 {
				odometer = int64(v)
			}
		}

		// Axis data (IO 17, 18, 19)
		xAxis := 0
		if val, ok := io[17]; ok {
			if v, ok2 := val.(int16); ok2 { xAxis = int(v) }
		}
		yAxis := 0
		if val, ok := io[18]; ok {
			if v, ok2 := val.(int16); ok2 { yAxis = int(v) }
		}
		zAxis := 0
		if val, ok := io[19]; ok {
			if v, ok2 := val.(int16); ok2 { zAxis = int(v) }
		}

		data := AVLData{
			IMEI:           imei,
			Time:           time.Unix(0, timestamp*int64(time.Millisecond)),
			Priority:       priority,
			Lat:            lat,
			Lng:            lng,
			Altitude:       alt,
			Heading:        heading,
			Satellites:     satellites,
			Speed:          speed,
			Odometer:       odometer,
			XAxis:          xAxis,
			YAxis:          yAxis,
			ZAxis:          zAxis,
			IO:             io,
		}
		data.Ignition = data.GetIgnitionFromIO()
		records = append(records, data)
		_ = eventID // Just to avoid unused var
		_ = totalIO
	}

	return records, nil
}
