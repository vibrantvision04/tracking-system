import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { CameraView } from 'expo-camera';

interface CameraCaptureProps {
  facing?: 'front' | 'back';
  onCapture: (base64: string) => void;
  onCancel: () => void;
  title?: string;
}

export default function CameraCapture({ facing = 'back', onCapture, onCancel, title = 'Capture Photo' }: CameraCaptureProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
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
          setBase64(result.base64);
        }
      } catch (err) {
        console.warn('Failed to take picture:', err);
      }
    }
  };

  const handleConfirm = () => {
    if (base64) {
      onCapture(base64);
    }
  };

  if (photo) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerText}>Confirm Captured Photo</Text>
        <Image source={{ uri: photo }} style={styles.previewImage} />
        
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, styles.retakeButton]} 
            onPress={() => {
              setPhoto(null);
              setBase64(null);
            }}
          >
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={handleConfirm}>
            <Text style={styles.buttonText}>Looks Good →</Text>
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
        <View style={styles.overlayContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>✕ Close</Text>
          </TouchableOpacity>
        </View>
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
});
