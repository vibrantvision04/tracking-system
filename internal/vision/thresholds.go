package vision

var (
	MinImageWidth       = 200
	MinImageHeight      = 200
	MaxImageWidth       = 10000
	MaxImageHeight      = 10000
	MaxImageSizeBytes   = 20 * 1024 * 1024

	BlurThreshold       = 100.0

	MinBrightness       = 30.0
	MaxBrightness       = 230.0

	MinFaceSizeRatio    = 0.02

	FaceCenterMargin    = 0.35

	MaxFaces            = 2
	MinFaces            = 1

	FaceDetectionScale  = 1.1
	FaceDetectionShift  = 0.1
	FaceDetectionMinSize = 50

	// Pigo detection quality threshold. Detections below this score are treated as
	// noise and discarded (reduces false "multiple people"). ~5.0 is the commonly
	// recommended value; tunable here without code changes.
	FaceQualityThreshold = 5.0
)

type Config struct {
	MinImageWidth       int
	MinImageHeight      int
	MaxImageWidth       int
	MaxImageHeight      int
	MaxImageSizeBytes   int64

	BlurThreshold       float64

	MinBrightness       float64
	MaxBrightness       float64

	MinFaceSizeRatio    float64
	FaceCenterMargin    float64

	MaxFaces            int
	MinFaces            int

	FaceDetectionScale  float64
	FaceDetectionShift  float64
	FaceDetectionMinSize int
	FaceQualityThreshold float64

	// SkipFaceChecks disables the (unreliable pigo) server-side face detection
	// entirely. Face presence/count is now validated on-device via Google ML Kit,
	// so the backend only performs image-quality checks (blur/brightness/integrity).
	SkipFaceChecks bool
}

func DefaultConfig() Config {
	return Config{
		MinImageWidth:       MinImageWidth,
		MinImageHeight:      MinImageHeight,
		MaxImageWidth:       MaxImageWidth,
		MaxImageHeight:      MaxImageHeight,
		MaxImageSizeBytes:   int64(MaxImageSizeBytes),
		BlurThreshold:       BlurThreshold,
		MinBrightness:       MinBrightness,
		MaxBrightness:       MaxBrightness,
		MinFaceSizeRatio:    MinFaceSizeRatio,
		FaceCenterMargin:    FaceCenterMargin,
		MaxFaces:            MaxFaces,
		MinFaces:            MinFaces,
		FaceDetectionScale:  FaceDetectionScale,
		FaceDetectionShift:  FaceDetectionShift,
		FaceDetectionMinSize: FaceDetectionMinSize,
		FaceQualityThreshold: FaceQualityThreshold,
	}
}
