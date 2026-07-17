import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Hostinger has been rate-limiting many parallel JS chunk requests on the live domain.
        // Keep the SPA in a single JS bundle so product pages do not fail while loading lazy chunks.
        inlineDynamicImports: true,
        entryFileNames: "assets/tradeon-app-20260717-v5.js",
        chunkFileNames: "assets/tradeon-chunk-20260717-v5-[hash].js",
        assetFileNames: "assets/tradeon-asset-20260717-v5-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
