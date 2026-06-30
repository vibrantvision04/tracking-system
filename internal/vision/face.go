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

	qThreshold := cfg.FaceQualityThreshold
	if qThreshold <= 0 {
		qThreshold = 5.0
	}
	dets := detector.RunCascade(cParams, qThreshold)
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

	// De-duplicate overlapping detections. Pigo can emit several boxes for a
	// single face (slightly different scales/positions) that don't get merged by
	// clustering, which would otherwise be miscounted as "multiple people". Two
	// genuinely different people do not overlap, so this is safe for the 2-person
	// (driver + helper) case.
	faces = dedupeOverlappingFaces(faces)

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
		// Note: we intentionally do NOT require the face to be near the image
		// center. The punch-in use case allows up to two people (driver + helper)
		// who naturally stand side-by-side and off-center. We only reject a face
		// that is actually cut off by the image edge (not fully visible).
		faceLeft := float64(face.X) / float64(w)
		faceRight := float64(face.X+face.Width) / float64(w)
		faceTop := float64(face.Y) / float64(h)
		faceBottom := float64(face.Y+face.Height) / float64(h)

		if faceLeft < -0.05 || faceRight > 1.05 || faceTop < -0.05 || faceBottom > 1.05 {
			issues = append(issues, "A face is cut off. Please keep all faces fully inside the frame.")
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

// faceIoU returns the Intersection-over-Union of two face boxes (0..1).
func faceIoU(a, b FaceBounds) float64 {
	ax2, ay2 := a.X+a.Width, a.Y+a.Height
	bx2, by2 := b.X+b.Width, b.Y+b.Height

	interX1 := maxInt(a.X, b.X)
	interY1 := maxInt(a.Y, b.Y)
	interX2 := minInt(ax2, bx2)
	interY2 := minInt(ay2, by2)

	iw := interX2 - interX1
	ih := interY2 - interY1
	if iw <= 0 || ih <= 0 {
		return 0
	}
	interArea := float64(iw * ih)
	areaA := float64(a.Width * a.Height)
	areaB := float64(b.Width * b.Height)
	union := areaA + areaB - interArea
	if union <= 0 {
		return 0
	}
	return interArea / union
}

// dedupeOverlappingFaces collapses boxes that overlap (IoU > 0.3) into one,
// keeping the larger box. This prevents a single face from being counted as
// multiple people while leaving non-overlapping (distinct) people intact.
func dedupeOverlappingFaces(faces []FaceBounds) []FaceBounds {
	const overlapThreshold = 0.3
	var kept []FaceBounds
	for _, f := range faces {
		merged := false
		for i := range kept {
			if faceIoU(f, kept[i]) > overlapThreshold {
				// Keep whichever box is larger.
				if f.Width*f.Height > kept[i].Width*kept[i].Height {
					kept[i] = f
				}
				merged = true
				break
			}
		}
		if !merged {
			kept = append(kept, f)
		}
	}
	return kept
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
