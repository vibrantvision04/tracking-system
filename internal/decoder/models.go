package decoder

import "time"

type AVLData struct {
	IMEI           string                 `json:"imei"`
	Time           time.Time              `json:"time"`
	Priority       byte                   `json:"priority"`
	Lat            float64                `json:"lat"`
	Lng            float64                `json:"lng"`
	Altitude       float64                `json:"altitude"`
	Heading        int                    `json:"heading"`
	Satellites     int                    `json:"satellites"`
	Speed          float64                `json:"speed"`
	Ignition       bool                   `json:"ignition"`
	HDOP           float64                `json:"hdop"`
	PDOP           float64                `json:"pdop"`
	Odometer       int64                  `json:"odometer"`
	XAxis          int                    `json:"x_axis"`
	YAxis          int                    `json:"y_axis"`
	ZAxis          int                    `json:"z_axis"`
	IO             map[uint16]interface{} `json:"io"`
}

// GetIgnitionFromIO extracts ignition status from common Teltonika IO IDs (239 or 1)
func (a *AVLData) GetIgnitionFromIO() bool {
	ids := []uint16{239, 1}
	for _, id := range ids {
		if val, ok := a.IO[id]; ok {
			switch v := val.(type) {
			case uint8:
				return v == 1
			case uint16:
				return v == 1
			case uint32:
				return v == 1
			case uint64:
				return v == 1
			}
		}
	}
	// Fallback: If moving, ignition is effectively on
	return a.Speed > 2
}

type Packet struct {
	IMEI    string
	Records []AVLData
}
