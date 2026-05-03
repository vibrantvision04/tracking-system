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

type Packet struct {
	IMEI    string
	Records []AVLData
}
