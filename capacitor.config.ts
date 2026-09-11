import type { CapacitorConfig } from '@capacitor/cli';

// NOTE: no `server` block on purpose.
//
// Lovable scaffolds this file with `server.url` pointing at a disposable
// *.lovableproject.com preview sandbox plus `cleartext: true`. In Capacitor,
// setting `server.url` makes the native WebView load that remote URL *instead of*
// the bundled `webDir` below — so a shipped build would depend permanently on a
// preview host we don't control, go blank if that sandbox is reclaimed, and hand
// whoever controls the URL the ability to change the app for every installed copy
// with no store review. `cleartext: true` additionally relaxes Android's network
// security config app-wide.
//
// Leave this block out so the app always loads the bundled `dist/` output.
const config: CapacitorConfig = {
  appId: 'app.lovable.9b21e26cc5cd41b4817cdd568d40eb7f',
  appName: 'humayra26',
  webDir: 'dist',
};

export default config;
