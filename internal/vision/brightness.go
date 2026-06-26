package vision

import (
	"image"
)

type BrightnessResult struct {
	Average float64
	Issues  []string
}

func CheckBrightness(img image.Image, cfg Config) BrightnessResult {
	bounds := img.Bounds()
	var totalLum float64
	var count int64

	for y := bounds.Min.Y; y < bounds.Max.Y; y += 4 {
		for x := bounds.Min.X; x < bounds.Max.X; x += 4 {
			r, g, b, _ := img.At(x, y).RGBA()
			lum := 0.299*float64(r/257) + 0.587*float64(g/257) + 0.114*float64(b/257)
			totalLum += lum
			count++
		}
	}

	if count == 0 {
		return BrightnessResult{Issues: []string{"Could not analyze image brightness."}}
	}

	average := totalLum / float64(count)

	var issues []string
	if average < cfg.MinBrightness {
		issues = append(issues, "Image is too dark.")
	}
	if average > cfg.MaxBrightness {
		issues = append(issues, "Image is overexposed.")
	}

	return BrightnessResult{
		Average: average,
		Issues:  issues,
	}
}
