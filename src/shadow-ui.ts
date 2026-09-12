/**
 * Shadow DOM widget factory for `debug-css-overflow`.
 *
 * The entire widget (card, tooltip, badge, controls, modal) lives inside a
 * Shadow Root attached to a single host element in `document.body`. This
 * guarantees style isolation in both directions:
 *
 *   * Host page CSS cannot leak into the widget (the shadow tree is scoped),
 *     and the `:host { all: initial; }` reset neutralizes inherited styles.
 *   * Widget CSS cannot leak onto the page. The only styles injected into the
 *     document are the highlight outlines (`PAGE_HIGHLIGHT_STYLES`) and the
 *     `--dcso-accent` custom property — both intentionally target page
 *     elements, so they live outside the shadow tree.
 */

import { ACCENT_PRESETS } from "./types";
import type { WidgetOffset, WidgetPosition } from "./types";

/** ID of the host element inserted into `document.body`. */
export const WIDGET_HOST_ID = "dcso-host";
/** ID of the `<style>` element injected into `document.head`. */
export const PAGE_STYLE_ID = "dcso-page-styles";

/** Every DOM node the detector needs to update. */
export interface WidgetNodes {
  host: HTMLElement;
  shadow: ShadowRoot;
  /** Inner wrapper (anchor for the tooltip/badge positioning). */
  root: HTMLElement;
  dot: HTMLElement;
  status: HTMLElement;
  badge: HTMLElement;
  badgeToggle: HTMLButtonElement;
  tooltipStatus: HTMLElement;
  tooltipViewport: HTMLElement;
  tooltipOffCount: HTMLElement;
  tooltipOffender: HTMLElement;
  tooltipOffLabel: HTMLElement;
  tooltipOffWidth: HTMLElement;
  tooltipOffExcess: HTMLElement;
  highlightBtn: HTMLButtonElement;
  colorInput: HTMLInputElement;
  swatches: HTMLElement;
}

/** Callbacks wiring widget interactions back to the detector. */
export interface WidgetCallbacks {
  /** Current minimized state (read live, not from a stale closure). */
  isMinimized(): boolean;
  onSetMinimized(minimized: boolean): void;
  onDisable(): void;
  onCyclePosition(): void;
  onAccentColor(color: string): void;
  onToggleHighlight(): void;
  onToggleBadge(): void;
}

/* --------------------------------------------------------------------------
 * Icons
 * ------------------------------------------------------------------------ */

const ROTATE_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10"></polyline>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
  </svg>`;

const POWER_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
    <line x1="12" y1="2" x2="12" y2="12"></line>
  </svg>`;

/* --------------------------------------------------------------------------
 * Widget styles (scoped to the shadow tree)
 * ------------------------------------------------------------------------ */

export const WIDGET_STYLES = `
/* The :host reset below uses all: initial to neutralize every inherited
   style from the page (fonts, colors, line-height, ...). CSS custom
   properties are included in that reset, so we re-inherit the accent color
   explicitly — the detector sets it on <html> and it must reach the widget
   through the shadow boundary. */
:host {
  all: initial;
  --dcso-accent: inherit;
  position: fixed;
  z-index: 2147483000; /* above everything on the page */
  box-sizing: border-box;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #111;
  user-select: none;
  -webkit-user-select: none;
  /* Smooth shift while resizing (top-right collision with the DevTools overlay) */
  transition: top 0.15s ease;
}
:host *,
:host *::before,
:host *::after { box-sizing: border-box; }

/* Corner placement (classes live on the host element). The default 12px
   gutter can be overridden per edge via the --dcso-offset-* custom
   properties — the detector sets them on the host (inline style) from the
   offset init option, so pages with a fixed header can drop the widget
   below it. */
:host(.dcso-pos-top-right)    { top: var(--dcso-offset-top, 12px);    right: var(--dcso-offset-right, 12px); }
:host(.dcso-pos-top-left)     { top: var(--dcso-offset-top, 12px);    left: var(--dcso-offset-left, 12px); }
:host(.dcso-pos-bottom-right) { bottom: var(--dcso-offset-bottom, 12px); right: var(--dcso-offset-right, 12px); }
:host(.dcso-pos-bottom-left)  { bottom: var(--dcso-offset-bottom, 12px); left: var(--dcso-offset-left, 12px); }

/* While actively resizing, Chrome DevTools shows a native [W x H] overlay at
   the top edge of the window. Drop the top-right widget down 20px more so
   the overlay does not cover its controls; the class is removed 500ms after
   the last resize event. */
:host(.dcso-resizing.dcso-pos-top-right) { top: calc(var(--dcso-offset-top, 12px) + 20px); }

.dcso-widget { position: relative; }

/* Widget body */
.dcso-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.92);
  color: #f8fafc;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(4px);
}

/* Status dot */
.dcso-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #34d399; /* OK — green */
  /* OK state is strictly static: no animations, pulses, or blinks */
  animation: none !important;
  flex: none;
}
/* Pulse only when overflowing, to draw attention to the breakage */
:host(.dcso-has-overflow) .dcso-dot {
  background: var(--dcso-accent, #ff0055);
  animation: dcso-pulse 1.1s ease-in-out infinite !important;
}
/* Explicit overflow class on the dot (also in the minimized state): accent
   color + pulse so a collapsed widget still signals */
.dcso-dot--overflow {
  background: var(--dcso-accent, #ff0055) !important;
  animation: dcso-pulse 1.1s ease-in-out infinite !important;
}
@keyframes dcso-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--dcso-accent, #ff0055); }
  50%      { box-shadow: 0 0 0 6px transparent; }
}

.dcso-status {
  font-weight: 600;
  white-space: nowrap;
}

/* Buttons: high contrast (white text/icon on dark surface) */
.dcso-btn {
  font: inherit;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  padding: 3px 7px;
  cursor: pointer;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.dcso-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.55);
}
.dcso-btn:active { transform: translateY(1px); }
.dcso-btn:focus-visible {
  outline: 2px solid var(--dcso-accent, #ff0055);
  outline-offset: 1px;
}
.dcso-btn.dcso-is-active {
  background: var(--dcso-accent, #ff0055);
  border-color: transparent;
  color: #fff;
}

/* Top-panel icon buttons (minimize / disable): compact square icons */
.dcso-icon-btn { min-width: 20px; min-height: 20px; padding: 2px 4px; }
.dcso-icon-btn svg { width: 12px; height: 12px; display: block; }
/* Disable button: hint of a destructive action on hover */
.dcso-disable:hover {
  background: rgba(220, 38, 38, 0.45);
  border-color: rgba(255, 120, 120, 0.7);
}

/* Corner-rotate button */
.dcso-btn-rotate { min-width: 22px; min-height: 20px; padding: 2px 4px; }
.dcso-btn-rotate svg { width: 13px; height: 13px; display: block; }

/* Tooltip (shown on hover) */
.dcso-tooltip {
  display: none;
  position: absolute;
  width: max-content;
  max-width: 280px;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.95);
  color: #f8fafc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.dcso-widget:hover .dcso-tooltip { display: block; }
/* Fallback placement (browsers without anchor positioning) */
:host(.dcso-pos-top-left) .dcso-tooltip,
:host(.dcso-pos-top-right) .dcso-tooltip { top: 100%; left: 0; }
:host(.dcso-pos-bottom-left) .dcso-tooltip,
:host(.dcso-pos-bottom-right) .dcso-tooltip { bottom: 100%; left: 0; margin-top: 0; margin-bottom: 6px; }

/* Progressive enhancement: CSS Anchor Positioning (Chrome 125+). The tooltip
   is anchored to the widget and the browser flips it automatically when it
   would overflow the viewport edge. */
@supports (position-anchor: --dcso-widget-anchor) {
  .dcso-widget { anchor-name: --dcso-widget-anchor; }
  .dcso-tooltip {
    position: fixed;
    position-anchor: --dcso-widget-anchor;
    max-width: calc(100vw - 32px);
    /* position-try-options is the legacy name, position-try-fallbacks the
       current one (flip-block / flip-inline / both). */
    position-try-options: flip-block, flip-inline, flip-block flip-inline;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
  }
  /* Position via anchor() insets. IMPORTANT: the corner selectors repeat the
     fallback rules with equal specificity, otherwise the fallback
     top:100%/left:0 would override the anchor() insets. */
  :host(.dcso-pos-top-left) .dcso-tooltip,
  :host(.dcso-pos-top-right) .dcso-tooltip {
    left: anchor(--dcso-widget-anchor left);
    top: anchor(--dcso-widget-anchor bottom);
  }
  :host(.dcso-pos-bottom-left) .dcso-tooltip,
  :host(.dcso-pos-bottom-right) .dcso-tooltip {
    left: anchor(--dcso-widget-anchor left);
    top: auto;
    bottom: anchor(--dcso-widget-anchor top);
    margin-top: 0;
    margin-bottom: 6px;
  }
}
.dcso-tooltip b { color: #fff; }
.dcso-tooltip kbd {
  font-family: inherit;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 0 5px;
}
/* Hide the "first offender" block when there are no offenders */
.dcso-tooltip-offender.dcso-hidden { display: none; }
/* Offender-count headline: visually separated from the offender details. */
.dcso-tooltip-off-count {
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  font-weight: 600;
}

/* Compact metrics badge for the MINIMIZED state: sits next to the dot without
   hover (e.g. "1280px · +40px" or "1280px · OK"). */
.dcso-badge {
  display: none;
  position: absolute;
  top: 50%;
  left: calc(100% + 6px);
  transform: translateY(-50%);
  font: 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #f8fafc;
  background: rgba(17, 24, 39, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 3px 7px;
  white-space: nowrap;
  pointer-events: none; /* never blocks clicks on the dot */
  z-index: 1;
}
:host(.dcso-minimized) .dcso-badge { display: inline-block; }
/* Right corners: badge on the LEFT of the dot so it never leaves the screen */
:host(.dcso-pos-top-right.dcso-minimized) .dcso-badge,
:host(.dcso-pos-bottom-right.dcso-minimized) .dcso-badge {
  left: auto;
  right: calc(100% + 6px);
}
/* Metrics toggle (👁) OFF: hide the badge entirely — display: none !important
   wins over every other rule, leaving ONLY the status indicator dot visible. */
:host(.dcso-minimized.dcso-hide-metrics) .dcso-badge {
  display: none !important;
}

/* Controls panel */
.dcso-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 6px;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}
.dcso-swatches { display: inline-flex; gap: 3px; align-items: center; }
.dcso-swatch {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.dcso-swatch.dcso-is-active { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8); }
.dcso-color {
  width: 20px;
  height: 18px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

/* Minimized state: a single small dot (click to expand) */
:host(.dcso-minimized) .dcso-card {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 50%;
  justify-content: center;
  cursor: pointer;
}
/* Hide status/buttons/panel, BUT keep the tooltip: hovering the dot must show
   the full diagnostics (status, viewport width, offender). */
:host(.dcso-minimized) .dcso-status,
:host(.dcso-minimized) .dcso-btn,
:host(.dcso-minimized) .dcso-controls {
  display: none !important;
  visibility: hidden !important;
}
:host(.dcso-minimized) .dcso-dot { width: 8px; height: 8px; }

/* Disable-confirmation modal (scoped to the shadow tree) */
.dcso-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483001; /* above the widget itself */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #111;
}
.dcso-modal__box {
  max-width: 420px;
  width: calc(100% - 32px);
  padding: 16px 18px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}
.dcso-modal__title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.dcso-modal__body { color: #374151; }
.dcso-modal__body code {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 1px 5px;
  color: #be123c;
}
.dcso-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.dcso-modal__actions button {
  font: inherit;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}
.dcso-modal__actions button:hover { filter: brightness(0.95); }
.dcso-modal__actions .dcso-modal__confirm {
  background: #be123c;
  border-color: #be123c;
  color: #fff;
}
`;

/* --------------------------------------------------------------------------
 * Page-level styles (injected into `document.head`)
 * ------------------------------------------------------------------------ */

/**
 * Highlight outlines for offenders. These classes are applied to PAGE
 * elements (not widget elements), so this stylesheet must live in the
 * document, outside the shadow tree.
 */
export const PAGE_HIGHLIGHT_STYLES = `
.dcso-highlighted,
.dcso-is-overflowing {
  outline: 2px solid var(--dcso-accent, #ff0055) !important;
  outline-offset: -2px !important;
}
`;

/* --------------------------------------------------------------------------
 * Host / style helpers
 * ------------------------------------------------------------------------ */

/** Normalizes any CSS color to `#rrggbb` for `<input type="color">`. */
export function normalizeColor(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return color; // e.g. jsdom without node-canvas
  ctx.fillStyle = color;
  return ctx.fillStyle; // the browser returns a normalized #rrggbb or "#000000"
}

/** Injects the page-level highlight stylesheet and the accent custom property. */
export function injectPageStyles(doc: Document, accentColor: string): void {
  doc.getElementById(PAGE_STYLE_ID)?.remove();
  const style = doc.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = PAGE_HIGHLIGHT_STYLES;
  doc.head.appendChild(style);
  doc.documentElement.style.setProperty("--dcso-accent", accentColor);
}

/** Removes the page-level highlight stylesheet and the accent custom property. */
export function removePageStyles(doc: Document): void {
  doc.getElementById(PAGE_STYLE_ID)?.remove();
  doc.documentElement.style.removeProperty("--dcso-accent");
}

/* --------------------------------------------------------------------------
 * Widget construction
 * ------------------------------------------------------------------------ */

/**
 * Applies per-edge offset overrides (see the --dcso-offset-* vars in
 * WIDGET_STYLES) as inline custom properties on the host — set inline so
 * they beat the `all: initial` reset in the :host rule and never inherit
 * page custom properties with the same name. Edges absent from `offset`
 * are cleared back to the default 12px gutter.
 */
export function applyWidgetOffset(
  host: HTMLElement,
  offset: WidgetOffset,
): void {
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const value = offset[edge];
    if (value !== undefined) {
      host.style.setProperty(`--dcso-offset-${edge}`, `${value}px`);
    } else {
      host.style.removeProperty(`--dcso-offset-${edge}`);
    }
  }
}

/**
 * Builds the host element with an attached Shadow Root and returns references
 * to every widget node. All styles live inside the shadow tree.
 */
export function buildWidgetHost(
  position: WidgetPosition,
  accentColor: string,
  minimized: boolean,
  showMetricsBadge: boolean,
  hotkeys: { toggleHighlight: string; toggleMinimize: string },
  offset: WidgetOffset,
  callbacks: WidgetCallbacks,
): WidgetNodes {
  const host = document.createElement("div");
  host.id = WIDGET_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  applyWidgetOffset(host, offset);

  const style = document.createElement("style");
  style.textContent = WIDGET_STYLES;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "dcso-widget";

  // --- Card header ---
  const card = document.createElement("div");
  card.className = "dcso-card";

  const dot = document.createElement("span");
  dot.className = "dcso-dot";

  const status = document.createElement("span");
  status.className = "dcso-status";
  status.textContent = "OK";

  const minimizeBtn = document.createElement("button");
  minimizeBtn.type = "button";
  minimizeBtn.className = "dcso-btn dcso-minimize dcso-icon-btn";
  minimizeBtn.title = `Collapse to a dot (${hotkeys.toggleMinimize})`;
  minimizeBtn.setAttribute("aria-label", "Collapse the widget to a dot");
  minimizeBtn.textContent = "—";

  const disableBtn = document.createElement("button");
  disableBtn.type = "button";
  disableBtn.className = "dcso-btn dcso-disable dcso-icon-btn";
  disableBtn.title = "Disable the utility completely";
  disableBtn.setAttribute("aria-label", "Disable the utility completely");
  disableBtn.innerHTML = POWER_ICON_SVG;

  // Top panel: [status] → [collapse] → [disable]
  card.append(dot, status, minimizeBtn, disableBtn);

  // --- Tooltip ---
  const tooltip = document.createElement("div");
  tooltip.className = "dcso-tooltip";
  tooltip.setAttribute("role", "tooltip");

  const tooltipStatus = document.createElement("div");
  tooltipStatus.className = "dcso-tooltip-status";
  const tooltipStatusB = document.createElement("b");
  tooltipStatusB.textContent = "OK — no horizontal overflow";
  tooltipStatus.append("Status: ", tooltipStatusB);

  const tooltipViewport = document.createElement("div");
  tooltipViewport.className = "dcso-tooltip-viewport";

  const tooltipOffender = document.createElement("div");
  tooltipOffender.className = "dcso-tooltip-offender dcso-hidden";
  const tooltipOffCount = document.createElement("div");
  tooltipOffCount.className = "dcso-tooltip-off-count";
  const tooltipOffLabel = document.createElement("div");
  tooltipOffLabel.className = "dcso-tooltip-off-label";
  const tooltipOffWidth = document.createElement("div");
  tooltipOffWidth.className = "dcso-tooltip-off-width";
  const tooltipOffExcess = document.createElement("div");
  tooltipOffExcess.className = "dcso-tooltip-off-excess";
  tooltipOffender.append(
    tooltipOffCount,
    tooltipOffLabel,
    tooltipOffWidth,
    tooltipOffExcess,
  );

  const tooltipShortcuts = document.createElement("div");
  tooltipShortcuts.className = "dcso-tooltip-shortcuts";
  const kbd1 = document.createElement("kbd");
  kbd1.textContent = hotkeys.toggleHighlight;
  tooltipShortcuts.append(kbd1, " — toggle container outlines");
  const kbd2 = document.createElement("kbd");
  kbd2.textContent = hotkeys.toggleMinimize;
  tooltipShortcuts.append(
    document.createElement("br"),
    kbd2,
    " — collapse / expand widget",
  );

  tooltip.append(tooltipStatus, tooltipViewport, tooltipOffender, tooltipShortcuts);

  // --- Compact metrics badge (minimized state only) ---
  const badge = document.createElement("span");
  badge.className = "dcso-badge";
  badge.textContent = "—";

  // --- Controls panel ---
  const controls = document.createElement("div");
  controls.className = "dcso-controls";

  const posBtn = document.createElement("button");
  posBtn.type = "button";
  posBtn.className = "dcso-btn dcso-btn-rotate";
  posBtn.title = "Rotate widget corner (saved to localStorage)";
  posBtn.setAttribute("aria-label", "Change the widget corner position");
  posBtn.innerHTML = ROTATE_ICON_SVG;

  const swatches = document.createElement("span");
  swatches.className = "dcso-swatches";
  for (const color of ACCENT_PRESETS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "dcso-btn dcso-swatch";
    swatch.dataset.color = color;
    swatch.style.background = color;
    swatch.title = `Highlight color: ${color}`;
    swatches.append(swatch);
  }

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "dcso-color";
  colorInput.title = "Custom highlight color";
  colorInput.value = normalizeColor(accentColor);

  const highlightBtn = document.createElement("button");
  highlightBtn.type = "button";
  highlightBtn.className = "dcso-btn dcso-toggle";
  highlightBtn.title = `Toggle container outlines (${hotkeys.toggleHighlight})`;
  highlightBtn.setAttribute("aria-label", "Toggle container outlines");
  highlightBtn.textContent = "◉";

  const badgeToggle = document.createElement("button");
  badgeToggle.type = "button";
  badgeToggle.className = "dcso-btn dcso-badge-toggle";
  badgeToggle.title = "Hide metrics badge in minimized state";
  badgeToggle.setAttribute(
    "aria-label",
    "Show or hide the metrics badge in the minimized state",
  );
  badgeToggle.setAttribute("aria-pressed", String(showMetricsBadge));
  badgeToggle.textContent = "👁";

  // Bottom panel: [rotate] [presets] [custom color] [highlight] [badge]
  controls.append(posBtn, swatches, colorInput, highlightBtn, badgeToggle);

  root.append(card, tooltip, badge, controls);
  shadow.appendChild(root);
  const target = document.body || document.documentElement;
  if (target) {
    target.appendChild(host);
  }

  // Initial state classes on the host (styles are :host-scoped).
  host.classList.add(`dcso-pos-${position}`);
  host.classList.toggle("dcso-minimized", minimized);
  host.classList.toggle("dcso-hide-metrics", !showMetricsBadge);
  host.setAttribute("aria-expanded", String(!minimized));

  // --- Event wiring ---
  minimizeBtn.addEventListener("click", (e) => {
    // stopPropagation: otherwise the click reaches the root handler, which
    // sees the now-minimized state and immediately expands the widget again.
    e.stopPropagation();
    callbacks.onSetMinimized(true);
  });
  // A click anywhere on the minimized "dot" (except buttons) expands the widget.
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (callbacks.isMinimized() && !target.closest(".dcso-btn")) {
      callbacks.onSetMinimized(false);
    }
  });
  posBtn.addEventListener("click", () => callbacks.onCyclePosition());
  swatches.addEventListener("click", (e) => {
    const swatch = (e.target as HTMLElement).closest<HTMLElement>(".dcso-swatch");
    const color = swatch?.dataset.color;
    if (color) callbacks.onAccentColor(color);
  });
  colorInput.addEventListener("input", () => callbacks.onAccentColor(colorInput.value));
  highlightBtn.addEventListener("click", () => callbacks.onToggleHighlight());
  badgeToggle.addEventListener("click", () => callbacks.onToggleBadge());
  disableBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // never let this reach the root (dot) handler
    callbacks.onDisable();
  });

  return {
    host,
    shadow,
    root,
    dot,
    status,
    badge,
    badgeToggle,
    tooltipStatus: tooltipStatusB,
    tooltipViewport,
    tooltipOffCount,
    tooltipOffender,
    tooltipOffLabel,
    tooltipOffWidth,
    tooltipOffExcess,
    highlightBtn,
    colorInput,
    swatches,
  };
}

/**
 * Shows the disable-confirmation modal inside the shadow tree. The modal
 * explains that the widget stays hidden only until the next reload and that
 * permanent disabling requires `initDebugCssOverflow({ enabled: false })`.
 */
export function buildDisableModal(
  shadow: ShadowRoot,
  onConfirm: () => void,
): void {
  if (shadow.getElementById("dcso-modal")) return; // already open

  const modal = document.createElement("div");
  modal.className = "dcso-modal";

  const box = document.createElement("div");
  box.className = "dcso-modal__box";

  const title = document.createElement("div");
  title.className = "dcso-modal__title";
  title.textContent = "Disable utility?";

  const body = document.createElement("div");
  body.className = "dcso-modal__body";
  const codeEl = document.createElement("code");
  codeEl.textContent = "initDebugCssOverflow({ enabled: false })";
  body.append(
    "The widget stays hidden until the page reloads. To disable the utility permanently, call ",
    codeEl,
    ".",
  );

  const actions = document.createElement("div");
  actions.className = "dcso-modal__actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "dcso-modal__cancel";
  cancelBtn.textContent = "Cancel";
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "dcso-modal__confirm";
  confirmBtn.textContent = "Disable";
  actions.append(cancelBtn, confirmBtn);

  box.append(title, body, actions);
  modal.append(box);
  shadow.appendChild(modal);

  const close = (): void => {
    modal.remove();
  };
  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close(); // click on the backdrop
  });
  confirmBtn.addEventListener("click", () => {
    close();
    onConfirm();
  });
}
