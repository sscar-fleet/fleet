// expo-sqlite sur le web (aperçu navigateur) a besoin des fichiers .wasm
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
module.exports = config;
