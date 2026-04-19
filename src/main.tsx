import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { setCnyToBdtRate, setMarkupPercentage } from "@/lib/currency";

// Preload currency settings before first render so prices use the correct rate
async function preloadCurrencySettings() {
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

// Force clear old service worker caches on load
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    });
  });
  // Reload once when a new SW takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
