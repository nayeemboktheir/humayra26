import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { imagetools } from "vite-imagetools";
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

// The root `.env` used to be committed, which meant a production build silently fell
// back to those values whenever the CI secrets were absent or misnamed. It is gitignored
// now, so that safety net is gone — and a build with no Supabase URL/key still "succeeds"
// and deploys a bundle that cannot talk to the backend at all. Fail loudly instead.
const requireSupabaseEnv = (env: Record<string, string>): Plugin => ({
  name: "require-supabase-env",
  apply: "build",
  config() {
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].filter(
      (key) => !env[key],
    );
    if (missing.length) {
      throw new Error(
        `Refusing to build: missing ${missing.join(", ")}. ` +
          `Set them in .env locally, or as repository secrets in the deploy workflow.`,
      );
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv resolves .env files *and* matching process.env vars (how CI supplies them).
  const env = loadEnv(mode, process.cwd(), "");
  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    imagetools({
      include: /\.(heif|avif|jpe?g|png|tiff|webp|gif)(\?.*)?$/i,
    }),
    mode === "development" && componentTagger(),
    nonBlockingCss(),
    requireSupabaseEnv(env),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Let Rollup fingerprint every output file. The HTML and assets are then
        // deployed as one immutable set, avoiding references to CI-renamed files
        // that may not exist on the web root.
        entryFileNames: "assets/tradeon-app-[hash].js",
        chunkFileNames: "assets/tradeon-chunk-[hash].js",
        assetFileNames: "assets/tradeon-asset-[hash][extname]",
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
};
});
