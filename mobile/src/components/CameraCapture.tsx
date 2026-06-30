import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { detectFaceCount } from '../utils/faceDetection';

export interface CaptureMeta {
  /** Number of faces detected on-device (Google ML Kit). */
  faceCount: number;
  /** Whether on-device detection actually ran in this build. */
  faceDetectionAvailable: boolean;
}

interface CameraCaptureProps {
  facing?: 'front' | 'back';
  onCapture: (base64: string, meta?: CaptureMeta) => void;
  onCancel?: () => void;
  title?: string;
  /** Maximum allowed people in frame (default 2: driver + helper). */
  maxFaces?: number;
}

export default function CameraCapture({ facing = 'back', onCapture, onCancel, title = 'Capture Photo', maxFaces = 2 }: CameraCaptureProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const result = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          base64: true,
        });
        if (result && result.base64) {
          setPhoto(result.uri);
          setUri(result.uri);
          setBase64(result.base64);
          setFaceError(null);
        }
      } catch (err) {
        console.warn('Failed to take picture:', err);
      }
    }
  };

  const handleConfirm = async () => {
    if (!base64) return;
    setValidating(true);
    setFaceError(null);
    try {
      const res = await detectFaceCount(uri || '');
      if (res.available) {
        if (res.count === 0) {
          setFaceError('No face detected. Please retake with your face clearly visible.');
          setValidating(false);
          return;
        }
        if (res.count > maxFaces) {
          setFaceError(`Multiple people detected (${res.count}). Only up to ${maxFaces} allowed in frame.`);
          setValidating(false);
          return;
        }
      }
      onCapture(base64, { faceCount: res.count, faceDetectionAvailable: res.available });
    } finally {
      setValidating(false);
    }
  };

  if (photo) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerText}>Confirm Captured Photo</Text>
        <Image source={{ uri: photo }} style={styles.previewImage} />

        {faceError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{faceError}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, styles.retakeButton]} 
            onPress={() => {
              setPhoto(null);
              setBase64(null);
              setUri(null);
              setFaceError(null);
            }}
            disabled={validating}
          >
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.confirmButton, validating && styles.buttonDisabled]} onPress={handleConfirm} disabled={validating}>
            {validating ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Looks Good →</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>{title}</Text>
      
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={facing} ref={cameraRef} />
        {onCancel && (
          <View style={styles.overlayContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
        <View style={styles.captureInnerCircle} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  headerText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 16,
    fontFamily: 'System',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlayContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  cancelButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cancelText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 16,
  },
  captureInnerCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#ef4444',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  button: {
    height: 56, // 56dp minimum touch target
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  retakeButton: {
    backgroundColor: '#4b5563',
  },
  confirmButton: {
    backgroundColor: '#1565C0',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
