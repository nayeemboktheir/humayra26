import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const nonBlockingCss = (): Plugin => ({
  name: "non-blocking-css",
  apply: "build",
  transformIndexHtml(html: string) {
    return html.replace(
      /<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*\/?>(?!\s*<\/noscript>)/g,
      (_m: string, href: string) =>
        `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'">` +
        `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    nonBlockingCss(),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Hostinger has been rate-limiting many parallel JS chunk requests on the live domain.
        // Keep the SPA in a single JS bundle so product pages do not fail while loading lazy chunks.
        inlineDynamicImports: true,
        entryFileNames: "assets/tradeon-app-20260717-v8.js",
        chunkFileNames: "assets/tradeon-chunk-20260717-v8-[hash].js",
        assetFileNames: "assets/tradeon-asset-20260717-v8-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
