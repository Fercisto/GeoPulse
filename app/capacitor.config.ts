import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fercisto.geopulse',
  appName: 'GeoPulse',
  webDir: 'www',
  android: {
    // Requerido por @capacitor-community/background-geolocation: evita que las
    // actualizaciones de ubicación se detengan tras ~5 min en segundo plano.
    useLegacyBridge: true,
  },
  plugins: {
    // fetch() pasa por HTTP nativo: sin CORS, sin bloqueo de "mixed content" y
    // sin el límite que Android impone al WebView en segundo plano.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
