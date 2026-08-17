/**
 * /react/ — React 19 with a plain CSS import (see App.tsx / app.css).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../shared/playground.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
