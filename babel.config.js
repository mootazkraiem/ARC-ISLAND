module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 moved its babel plugin into react-native-worklets — the
    // old 'react-native-reanimated/plugin' path throws on SDK 57. Must
    // always be listed last.
    plugins: ['react-native-worklets/plugin'],
  };
};
