import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app is the web build, bundled inside the app and opened in the system WebView.
 * Nothing is loaded from a server: the files, the data and the calculations all live on the device.
 *
 * `appId` becomes the Google Play package name and can never be changed after the first upload —
 * confirm it (and the matching `applicationId` in android/app/build.gradle) BEFORE creating the app in Play Console.
 */
const config: CapacitorConfig = {
  appId: 'app.freelanche.tracker',
  appName: 'Freelanche',
  webDir: 'dist',
  // Quiet in release builds: no request or plugin logging.
  loggingBehavior: 'none',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
