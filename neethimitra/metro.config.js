const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add path aliases support
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
  '@constants': path.resolve(__dirname, 'src/constants'),
  '@components': path.resolve(__dirname, 'src/components'),
  '@store': path.resolve(__dirname, 'src/store'),
  '@services': path.resolve(__dirname, 'src/services'),
  '@utils': path.resolve(__dirname, 'src/utils'),
};

config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
