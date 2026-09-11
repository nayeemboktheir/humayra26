/// <reference types="vite/client" />

// Local images are imported through vite-imagetools query params, e.g.
//   import logo from "@/assets/logo-full.png?w=640&format=webp";
// (see the "Images" note in CLAUDE.md). Vite's own client types declare only the
// bare `*.png` / `*.jpeg` forms, so every suffixed import raised TS2307 "cannot find
// module" — the three errors that stood between this repo and a working
// `tsc --noEmit`.
//
// Note this must be a *single*-wildcard pattern: TypeScript allows only one `*` in an
// ambient module name, so the more precise `"*.png?*"` is silently ignored. Matching
// the asset directory instead covers every image type and every query string, and only
// applies as a fallback when path resolution finds no real file (which is exactly the
// imagetools case — the bare, unsuffixed imports still resolve normally).
declare module "@/assets/*" {
  const src: string;
  export default src;
}
