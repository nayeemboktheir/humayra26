import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
