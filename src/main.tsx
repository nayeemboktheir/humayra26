import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { setCnyToBdtRate, setMarkupPercentage } from "@/lib/currency";

// Load currency settings in the background. This deliberately does NOT block the
// first render: prices paint with the fallback rate and correct themselves via the
// currency subscription in App once the real values arrive.
async function loadCurrencySettings() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["cny_to_bdt_rate", "price_markup_percentage"]);
    if (data) {
      for (const row of data) {
        if (row.key === "cny_to_bdt_rate") {
          const r = parseFloat(row.value);
          if (r > 0) setCnyToBdtRate(r);
        } else if (row.key === "price_markup_percentage") {
          const m = parseFloat(row.value);
          if (m >= 0) setMarkupPercentage(m);
        }
      }
    }
  } catch (e) {
    console.warn("Failed to preload currency settings", e);
  }
}

// Prevent the browser's default mini-infobar / "Add to Home Screen" banner
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
});

// Remove the old app-shell service worker that cached stale product pages on the live site.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      const scriptUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
      if (scriptUrl.includes("/sw.js")) {
        reg.unregister();
      }
    });
  });
}

// Chrome/Google Translate (and some in-app webview translators) rewrite text
// nodes into <font> wrappers. When React later tries to remove or reorder those
// nodes it crashes with "Failed to execute 'removeChild' on 'Node'" and the
// whole page goes blank. Make the DOM mutations tolerant of externally-moved
// nodes so translation can never white-screen the app.
if (typeof Node === "function" && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  // @ts-expect-error - intentionally permissive signature for resilience
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn("removeChild skipped: node already moved (browser translation)");
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  // @ts-expect-error - intentionally permissive signature for resilience
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn("insertBefore skipped: reference moved (browser translation)");
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

createRoot(document.getElementById("root")!).render(<App />);

void loadCurrencySettings();
