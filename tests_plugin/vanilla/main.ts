/**
 * /vanilla/ — plain HTML + a TypeScript module. No framework, no bundling
 * tricks: the detector runs against a hand-rolled DOM.
 */
import { initDebugCssOverflow } from "debug-css-overflow";
import { initPlayground, WIDGET_OFFSET } from "../shared/playground";
import "../shared/playground.css";
import "../shared/overflow-cases.css";

initPlayground("vanilla");
window.__dcso = initDebugCssOverflow({ position: "top-right", offset: WIDGET_OFFSET });
