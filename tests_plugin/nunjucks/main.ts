/**
 * /nunjucks/ — Nunjucks template (vite-plugin-njk-frontmatter) + HTMX.
 *
 * Demonstrates the detector reacting to DYNAMIC DOM insertion: HTMX swaps
 * content into #htmx-slot and the widget rescans via its MutationObserver.
 * We also listen to htmx:afterSettle and refresh explicitly so the timing is
 * deterministic for the screenshot suite.
 */
import "htmx.org";
import { initDebugCssOverflow } from "debug-css-overflow";
import {
  computeWidgetOffset,
  initPlayground,
  syncNavbarHeight,
} from "../shared/playground";
import "../shared/playground.css";
import "../shared/overflow-cases.css";

initPlayground("nunjucks");
syncNavbarHeight();

document.addEventListener("htmx:afterSettle", () => {
  window.__dcso?.refresh();
});

window.__dcso = initDebugCssOverflow({
  position: "top-right",
  offset: computeWidgetOffset(),
});
