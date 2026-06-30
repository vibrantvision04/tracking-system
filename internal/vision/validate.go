package vision

import (
	_ "embed"
	"sync"
)

var (
	initOnce sync.Once
	initErr  error
)

type ValidationResult struct {
	Valid     bool     `json:"valid"`
	FaceCount int      `json:"face_count"`
	Issues    []string `json:"issues"`
	Blurred   bool     `json:"blurred"`
	Dark      bool     `json:"dark"`
	Overexposed bool   `json:"overexposed"`
	Width     int      `json:"width"`
	Height    int      `json:"height"`
}

func InitDetector() error {
	initOnce.Do(func() {
		_, err := getFaceDetector()
		if err != nil {
			initErr = err
		}
	})
	return initErr
}

func ValidatePhoto(base64Str string, cfg Config) ValidationResult {
	if cfg.MinImageWidth == 0 {
		cfg = DefaultConfig()
	}

	integrity := CheckIntegrity(base64Str, cfg)

	if !integrity.Valid && len(integrity.Issues) > 0 {
		return ValidationResult{
			Valid:  false,
			Issues: integrity.Issues,
		}
	}

	var allIssues []string

	allIssues = append(allIssues, integrity.Issues...)

	if integrity.Image == nil {
		if len(allIssues) == 0 {
			allIssues = append(allIssues, "Could not process image.")
		}
		return ValidationResult{
			Valid:  false,
			Issues: allIssues,
		}
	}

	brightness := CheckBrightness(integrity.Image, cfg)
	allIssues = append(allIssues, brightness.Issues...)

	blur := CheckBlur(integrity.Image, cfg)
	allIssues = append(allIssues, blur.Issues...)

	faceCount := 0
	if !cfg.SkipFaceChecks {
		face := DetectFaces(integrity.Image, cfg)
		allIssues = append(allIssues, face.Issues...)
		faceCount = face.Count
	}

	valid := len(allIssues) == 0

	return ValidationResult{
		Valid:       valid,
		FaceCount:   faceCount,
		Issues:      allIssues,
		Blurred:     blur.Blurred,
		Dark:        len(brightness.Issues) > 0 && brightness.Average < cfg.MinBrightness,
		Overexposed: len(brightness.Issues) > 0 && brightness.Average > cfg.MaxBrightness,
		Width:       integrity.Width,
		Height:      integrity.Height,
	}
}
