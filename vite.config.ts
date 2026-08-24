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
        entryFileNames: "assets/tradeon-app-20260717-v8.js",
        chunkFileNames: "assets/tradeon-chunk-20260717-v8-[hash].js",
        assetFileNames: "assets/tradeon-asset-20260717-v8-[hash][extname]",
        // Hostinger rate-limits many parallel JS chunk requests, which is why this was
        // previously built as one inlined bundle. Rather than going back to per-route
        // chunks (dozens of parallel requests), collapse everything into a handful of
        // deliberate groups: a visitor browsing products loads only entry + vendor,
        // and the admin/dashboard/chart/pdf groups are fetched on demand.
        manualChunks(id: string) {
          // Vite's preload helper is statically imported by the entry. If Rollup parks
          // it inside one of the lazy vendor groups, that whole group (e.g. jspdf +
          // html2canvas) becomes a static dependency of the entry and lands back on the
          // homepage critical path. Pin it to the always-loaded vendor chunk.
          if (id.includes("vite/preload-helper") || id.includes("vite/modulepreload-polyfill")) {
            return "vendor";
          }
          if (id.includes("node_modules")) {
            if (/[\/]node_modules[\/](recharts|d3-|victory-|internmap|delaunator|robust-predicates)/.test(id)) {
              return "vendor-charts";
            }
            if (/[\/]node_modules[\/](jspdf|html2canvas|canvg)/.test(id)) {
              return "vendor-pdf";
            }
            return "vendor";
          }
          // Application code is left to Rollup, which splits it along the lazy()
          // route boundaries. Forcing src/ into manual groups here made the entry
          // chunk statically depend on the admin group (and through it, recharts),
          // which put both back on the homepage's critical path.
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
