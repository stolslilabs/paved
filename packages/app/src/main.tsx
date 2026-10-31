import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MOCKED } from "./data/data-source";
import { loadFontAwesomeWhenIdle } from "./lib/font-awesome";
import { listenForStaleChunks } from "./lib/stale-chunk";
import { whenIdle } from "./routes/prefetch";
import "./styles/index.css";

// A chunk of a build the host no longer serves reloads the tab once, onto the latest build (#589).
listenForStaleChunks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Font Awesome Pro (section 8): 2 MB of script, fetched once the first frame is painted.
loadFontAwesomeWhenIdle();

// The previous client's service worker and caches (#589), removed once per browser; its own chunk, fetched when idle. A mock
// build then registers its offline worker (#927, `lib/offline-worker.ts`), at once: the network may be cut seconds after the
// first load, and every file it keeps is one the tab can still load.
const clearLegacy = () => import("./lib/legacy-sw").then((m) => m.clearLegacyServiceWorkers());
if (MOCKED && import.meta.env.PROD)
  void import("./lib/offline-worker")
    .then((m) => m.registerOfflineWorker({ serviceWorker: navigator.serviceWorker, clearLegacy }))
    .catch(() => {});
else whenIdle(() => void clearLegacy().catch(() => {}));
