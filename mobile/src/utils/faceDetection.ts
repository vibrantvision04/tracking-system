// On-device face detection using Google ML Kit (free, offline, reliable).
//
// This wraps `@react-native-ml-kit/face-detection`. The native module is only
// available in a development/production build (NOT Expo Go). We load it lazily
// and degrade gracefully: if the module isn't present, `available` is false and
// callers should fall back to allowing the capture (server still does image
// quality checks). Once the dev build includes the module, detection works.

let FaceDetectionModule: any = null;
try {
  // @ts-ignore - native module is only present in a dev/prod build (not Expo Go)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FaceDetectionModule = require('@react-native-ml-kit/face-detection').default;
} catch {
  FaceDetectionModule = null;
}

export interface FaceDetectionResult {
  /** Whether the native ML Kit module was available and ran. */
  available: boolean;
  /** Number of faces detected (0 when unavailable). */
  count: number;
}

/**
 * Detect the number of faces in a captured image.
 * @param uri A local file URI (e.g. the `uri` from expo-camera takePictureAsync).
 */
export async function detectFaceCount(uri: string): Promise<FaceDetectionResult> {
  if (!FaceDetectionModule || !uri) {
    return { available: false, count: 0 };
  }
  try {
    const faces = await FaceDetectionModule.detect(uri, {
      performanceMode: 'accurate',
      landmarkMode: 'none',
      contourMode: 'none',
      classificationMode: 'none',
      minFaceSize: 0.1,
    });
    const count = Array.isArray(faces) ? faces.length : 0;
    return { available: true, count };
  } catch {
    // On any native error, don't block the user — let the flow proceed.
    return { available: false, count: 0 };
  }
}

/** True when the ML Kit native module is present in this build. */
export function isFaceDetectionAvailable(): boolean {
  return FaceDetectionModule != null;
}
