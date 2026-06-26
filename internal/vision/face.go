package vision

import (
	_ "embed"
	"image"
	"sync"

	pigo "github.com/esimov/pigo/core"
)

//go:embed cascade/facefinder
var cascadeData []byte

var (
	faceDetector     *pigo.Pigo
	faceDetectorOnce sync.Once
	faceDetectorErr  error
)

func getFaceDetector() (*pigo.Pigo, error) {
	faceDetectorOnce.Do(func() {
		if len(cascadeData) == 0 {
			faceDetectorErr = nil
			return
		}

		pigoObj := pigo.NewPigo()
		classifier, err := pigoObj.Unpack(cascadeData)
		if err != nil {
			faceDetectorErr = err
			return
		}
		faceDetector = classifier
	})
	return faceDetector, faceDetectorErr
}

type FaceResult struct {
	Count      int
	Faces      []FaceBounds
	Issues     []string
	Detected   bool
}

type FaceBounds struct {
	X      int
	Y      int
	Width  int
	Height int
	CenterX float64
	CenterY float64
}

func DetectFaces(img image.Image, cfg Config) FaceResult {
	detector, err := getFaceDetector()
	if err != nil {
		return FaceResult{Issues: []string{"Face detection initialization failed."}}
	}
	if detector == nil {
		return FaceResult{Issues: []string{"Face detection not available."}}
	}

	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	pixels := pigo.RgbToGrayscale(img)

	cParams := pigo.CascadeParams{
		MinSize:     cfg.FaceDetectionMinSize,
		MaxSize:     w,
		ShiftFactor: cfg.FaceDetectionShift,
		ScaleFactor: cfg.FaceDetectionScale,
		ImageParams: pigo.ImageParams{
			Pixels: pixels,
			Rows:   h,
			Cols:   w,
			Dim:    w,
		},
	}

	dets := detector.RunCascade(cParams, 0.0)
	dets = detector.ClusterDetections(dets, 0.2)

	if len(dets) == 0 {
		return FaceResult{
			Count:    0,
			Detected: false,
			Issues:   []string{"No face detected."},
		}
	}

	var faces []FaceBounds
	for _, det := range dets {
		faceW := int(det.Scale)
		faceH := int(det.Scale)
		faceX := det.Col - faceW/2
		faceY := det.Row - faceH/2

		faces = append(faces, FaceBounds{
			X:       faceX,
			Y:       faceY,
			Width:   faceW,
			Height:  faceH,
			CenterX: float64(det.Col) / float64(w),
			CenterY: float64(det.Row) / float64(h),
		})
	}

	var issues []string

	if len(faces) > cfg.MaxFaces {
		issues = append(issues, "Multiple people detected. Please capture only the required personnel.")
	}

	if len(faces) < cfg.MinFaces {
		issues = append(issues, "No face detected.")
	}

	for _, face := range faces {
		faceAreaRatio := float64(face.Width*face.Height) / float64(w*h)
		if faceAreaRatio < cfg.MinFaceSizeRatio {
			issues = append(issues, "Move closer to the camera.")
			break
		}
	}

	for _, face := range faces {
		offsetX := face.CenterX - 0.5
		offsetY := face.CenterY - 0.5
		if offsetX < 0 {
			offsetX = -offsetX
		}
		if offsetY < 0 {
			offsetY = -offsetY
		}

		if offsetX > cfg.FaceCenterMargin || offsetY > cfg.FaceCenterMargin {
			issues = append(issues, "Please keep your face inside the frame.")
			break
		}

		faceLeft := float64(face.X) / float64(w)
		faceRight := float64(face.X+face.Width) / float64(w)
		faceTop := float64(face.Y) / float64(h)
		faceBottom := float64(face.Y+face.Height) / float64(h)

		if faceLeft < -0.05 || faceRight > 1.05 || faceTop < -0.05 || faceBottom > 1.05 {
			issues = append(issues, "Please keep your face inside the frame.")
			break
		}
	}

	return FaceResult{
		Count:    len(faces),
		Faces:    faces,
		Issues:   issues,
		Detected: len(faces) > 0,
	}
}

func IsFaceCountValid(count, min, max int) bool {
	return count >= min && count <= max
}
