package decoder

import "encoding/binary"

// CRC16 returns the CRC16-IBM checksum of the data.
func CRC16(data []byte) uint16 {
	var crc uint16 = 0x0000
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ 0xA001
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}

func ValidatePacket(data []byte) bool {
	if len(data) < 12 {
		return false
	}
	// Data length is from byte 4 to (len-4)
	dataLen := binary.BigEndian.Uint32(data[4:8])
	if uint32(len(data)-12) != dataLen {
		return false
	}
	
	packetCRC := binary.BigEndian.Uint32(data[len(data)-4:])
	calculatedCRC := uint32(CRC16(data[8 : len(data)-4]))
	
	return packetCRC == calculatedCRC
}
