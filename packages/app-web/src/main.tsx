import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "@paved/ui";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TamaguiProvider>
  </StrictMode>
);
