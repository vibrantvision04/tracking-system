package vision

import (
	"image"
	"image/color"
)

type BlurResult struct {
	Variance float64
	Blurred  bool
	Issues   []string
}

func toGray(img image.Image) [][]float64 {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	gray := make([][]float64, h)
	for y := 0; y < h; y++ {
		gray[y] = make([]float64, w)
		for x := 0; x < w; x++ {
			r, g, b, _ := img.At(x+bounds.Min.X, y+bounds.Min.Y).RGBA()
			lum := 0.299*float64(r/257) + 0.587*float64(g/257) + 0.114*float64(b/257)
			gray[y][x] = lum
		}
	}
	return gray
}

func laplacian3x3(gray [][]float64) [][]float64 {
	kernel := [3][3]float64{
		{0, 1, 0},
		{1, -4, 1},
		{0, 1, 0},
	}

	h := len(gray)
	w := len(gray[0])
	result := make([][]float64, h)
	for y := 0; y < h; y++ {
		result[y] = make([]float64, w)
		for x := 0; x < w; x++ {
			if x == 0 || y == 0 || x == w-1 || y == h-1 {
				result[y][x] = 0
				continue
			}
			var sum float64
			for ky := -1; ky <= 1; ky++ {
				for kx := -1; kx <= 1; kx++ {
					sum += kernel[ky+1][kx+1] * gray[y+ky][x+kx]
				}
			}
			result[y][x] = sum
		}
	}
	return result
}

func variance(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}
	var mean float64
	for _, v := range data {
		mean += v
	}
	mean /= float64(len(data))

	var sqDiff float64
	for _, v := range data {
		d := v - mean
		sqDiff += d * d
	}
	return sqDiff / float64(len(data))
}

func CheckBlur(img image.Image, cfg Config) BlurResult {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	if w < 32 || h < 32 {
		return BlurResult{Issues: []string{"Image too small for blur detection."}}
	}

	gray := toGray(img)

	resizedGray := downsample(gray, 160)

	laplacian := laplacian3x3(resizedGray)

	var flat []float64
	for _, row := range laplacian {
		flat = append(flat, row...)
	}

	v := variance(flat)

	var issues []string
	blurred := v < cfg.BlurThreshold
	if blurred {
		issues = append(issues, "Image is blurry. Please capture again.")
	}

	return BlurResult{
		Variance: v,
		Blurred:  blurred,
		Issues:   issues,
	}
}

func downsample(gray [][]float64, maxDim int) [][]float64 {
	h := len(gray)
	if h == 0 {
		return gray
	}
	w := len(gray[0])

	scale := 1.0
	if w > h {
		if w > maxDim {
			scale = float64(maxDim) / float64(w)
		}
	} else {
		if h > maxDim {
			scale = float64(maxDim) / float64(h)
		}
	}

	if scale >= 1.0 {
		return gray
	}

	nw := int(float64(w) * scale)
	nh := int(float64(h) * scale)
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}

	result := make([][]float64, nh)
	for y := 0; y < nh; y++ {
		result[y] = make([]float64, nw)
		for x := 0; x < nw; x++ {
			srcX := int(float64(x) / scale)
			srcY := int(float64(y) / scale)
			if srcX >= w {
				srcX = w - 1
			}
			if srcY >= h {
				srcY = h - 1
			}
			result[y][x] = gray[srcY][srcX]
		}
	}
	return result
}

var _ color.Color = color.Gray{}
