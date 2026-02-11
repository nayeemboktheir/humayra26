import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent the browser's default mini-infobar / "Add to Home Screen" banner
// This must run as early as possible before any component mounts
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
