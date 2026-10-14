import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadFontAwesomeWhenIdle } from "./lib/font-awesome";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Font Awesome Pro (section 8): 2 MB of script, fetched once the first frame is painted.
loadFontAwesomeWhenIdle();
