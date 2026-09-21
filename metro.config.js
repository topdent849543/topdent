// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle 3D model files (used by components/Logo3D.tsx)
// so that `require('../assets/models/logo-3d.glb')` resolves correctly
// on native and web builds.
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'glb',
  'gltf',
  'bin',
];

module.exports = config;
