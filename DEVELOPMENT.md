# Development Setup — Mobile App

## Prerequisites

- Node.js 18+, npm
- Expo account (`eas login`)
- Android: Android Studio + Android SDK (API 35+) OR EAS Build
- iOS: macOS + Xcode 16+ OR EAS Build

## Quick Start (Metro + Dev Client)

```bash
cd mobile
npm install
npx expo start
```

Then press `a` (Android emulator) or `i` (iOS simulator). The dev client opens automatically (shake device or `Ctrl+M` for dev menu).

## Development Builds

### Why Dev Builds?

The app uses native modules (`@react-native-ml-kit/face-detection`, `react-native-maps`, etc.) that are **not available in Expo Go**. Dev builds bundle everything into a custom APK/IPA with fast refresh and the dev menu.

### Build for Android (local)

```bash
cd android
./gradlew assembleRelease          # release APK
./gradlew assembleDebug            # debug APK (includes dev client)
```

OR via EAS:

```bash
eas build --platform android --profile development
eas build --platform android --profile preview
eas build --platform android --profile production
```

### Build for iOS (EAS only locally, or Xcode on macOS)

```bash
eas build --platform ios --profile development   # needs Apple Developer account
eas build --platform ios --profile production
```

### Install Build

- **EAS**: QR code in terminal → download to device
- **Local APK**: `adb install android/app/build/outputs/apk/debug/app-debug.apk`

## Daily Workflow

```bash
npx expo start              # starts Metro bundler with dev client
```

Changes to JS/TS files → Metro hot reloads instantly.  
Changes to native code (plugins, native modules) → need `npx expo prebuild --clean` then rebuild.

## Adding a New Native Module

1. `npx expo install <package>`
2. Add to `plugins` in `app.json` if required by the library
3. `npx expo prebuild`
4. Rebuild the dev binary

## When to Rebuild

| Change | Rebuild? |
|--------|----------|
| JS/TS/TSX code | No (hot reload) |
| `app.json` (plugins, permissions) | Yes → `expo prebuild` → rebuild |
| New native dependency | Yes → `expo prebuild` → rebuild |
| EAS config (`eas.json`) | No |
| `.env` vars | No (restart Metro) |

## Troubleshooting

- **"No development build" error**: Install the latest dev build APK/IPA on your device
- **Metro can't resolve modules**: `cd mobile && npx expo start --clear`
- **Android build failed**: `cd android && ./gradlew clean && ./gradlew assembleDebug`
- **Native module not found**: `npx expo prebuild` → rebuild
- **EAS Build fails**: `eas build:list` to see logs; check `eas.json` profiles
