// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

const config = getDefaultConfig(__dirname);

// On Windows (no watchman), Metro's fallback watcher recursively watches
// node_modules — including transient native Gradle build artifacts created by
// `expo run:android` (e.g. @react-native-ml-kit/.../android/build/.transforms/...).
// When Gradle deletes those files mid-build, the watcher throws ENOENT and
// crashes the dev server. Exclude native build output from resolution/watching.
config.resolver.blockList = exclusionList([
  /node_modules\/.*\/android\/build\/.*/,
  /node_modules\/.*\/android\/\.cxx\/.*/,
  /node_modules\/.*\/\.transforms\/.*/,
  /.*\/android\/build\/.*/,
]);

module.exports = config;
