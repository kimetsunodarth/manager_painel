export const APP_VERSION =
  // esbuild define em build-bundle.js injeta __APP_VERSION__ no bundle do .exe
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null) ||
  process.env.APP_VERSION ||
  'dev';

