package vision

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"strings"
)

type IntegrityResult struct {
	Valid    bool
	Width    int
	Height   int
	Format   string
	Data     []byte
	Image    image.Image
	Issues   []string
}

func CheckIntegrity(base64Str string, cfg Config) IntegrityResult {
	raw := strings.TrimSpace(base64Str)

	if len(raw) == 0 {
		return IntegrityResult{Issues: []string{"Empty photo data."}}
	}

	if int64(len(raw)) > cfg.MaxImageSizeBytes*4/3+65536 {
		return IntegrityResult{Issues: []string{"Image file too large."}}
	}

	if len(raw)%4 != 0 {
		padding := 4 - len(raw)%4
		raw += strings.Repeat("=", padding)
	}

	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return IntegrityResult{Issues: []string{"Invalid image data."}}
	}

	if len(decoded) < 16 {
		return IntegrityResult{Issues: []string{"Corrupted image file."}}
	}

	if !isValidImageHeader(decoded) {
		return IntegrityResult{Issues: []string{"Unsupported image format."}}
	}

	img, format, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		return IntegrityResult{Issues: []string{"Corrupted image file."}}
	}

	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	var issues []string
	valid := true

	if w < cfg.MinImageWidth || h < cfg.MinImageHeight {
		issues = append(issues, fmt.Sprintf("Image resolution too low (%dx%d).", w, h))
		valid = false
	}

	return IntegrityResult{
		Valid:  valid,
		Width:  w,
		Height: h,
		Format: format,
		Data:   decoded,
		Image:  img,
		Issues: issues,
	}
}

func isValidImageHeader(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return true
	}
	if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
		return true
	}
	return false
}
