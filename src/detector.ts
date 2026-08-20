/**
 * Core overflow detection logic and the {@link OverflowDetector} controller.
 *
 * Detection is event-driven (no `setInterval` polling):
 *
 *   * `window` `resize` events (debounced),
 *   * a `MutationObserver` on `document.documentElement` watching `class`
 *     attributes and node insertion/removal,
 *   * a `ResizeObserver` on `document.documentElement` catching element size
 *     changes.
 *
 * Highlight application is mutation-safe: classes are only added/removed when
 * their state actually changes, so the observers never loop on themselves.
 */

import {
  buildDisableModal,
  buildWidgetHost,
  injectPageStyles,
  normalizeColor,
  removePageStyles,
} from "./shadow-ui";
import type { WidgetNodes } from "./shadow-ui";
import { DEFAULT_OPTIONS, WIDGET_POSITIONS } from "./types";
import type {
  DebugCssOverflowController,
  DebugCssOverflowOptions,
  OffenderInfo,
  OverflowState,
  WidgetPosition,
} from "./types";

/** Custom event name dispatched on `document` whenever the overflow state changes. */
export const OVERFLOW_CHANGE_EVENT = "debug-css-overflow:change";

type ResolvedOptions = Omit<
  Required<Omit<DebugCssOverflowOptions, "onChange" | "hotkeys">>,
  "hotkeys"
> & {
  hotkeys: { toggleHighlight: string; toggleMinimize: string };
} & Pick<DebugCssOverflowOptions, "onChange">;

interface ParsedHotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

/* ==========================================================================
 * Environment detection
 * ========================================================================== */

/**
 * True when running inside jsdom (where `requestAnimationFrame` is defined
 * but never fires its callbacks).  Used to fall back to synchronous DOM
 * writes so the tests still pass.
 */
const IS_JSDOM =
  typeof navigator !== "undefined" && /jsdom/.test(navigator.userAgent);

/* ==========================================================================
 * Pure geometry helpers (unit-testable without a real layout engine)
 * ========================================================================== */

/** Viewport width; `clientWidth` of `<html>` excludes the scrollbar. */
export function getViewportWidth(win: Window): number {
  return win.document.documentElement.clientWidth || win.innerWidth;
}

/**
 * Whole-page overflow: the document is wider than the window (horizontal
 * scroll). This is an independent "page-level" signal — the widget must show
 * OVERFLOW even when no individual node reports scrollWidth > clientWidth.
 */
export function isPageOverflowing(win: Window): boolean {
  const doc = win.document;
  const docWidth = doc.documentElement.scrollWidth;
  const body = doc.body;
  const bodyWidth = body ? body.scrollWidth : 0;
  return Math.max(docWidth, bodyWidth) > getViewportWidth(win);
}

/**
 * True when the element's right edge sticks out beyond the viewport (negative
 * margins, padding mistakes, wide children, ...). The +1px accounts for
 * subpixel rendering.
 */
export function isExceedingViewport(el: Element, innerWidth: number): boolean {
  const rect = el.getBoundingClientRect();
  return rect.right > innerWidth + 1;
}

/**
 * Walks up from `el` to find an ancestor with `overflow-x: auto` or
 * `overflow-x: scroll`. Returns the scrolling container, or `null` when
 * there is none (the element is a true page-level offender).
 */
function findScrollableAncestor(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (
      style.overflowX === "auto" ||
      style.overflowX === "scroll"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Scans the whole document for elements wider than the viewport: `offsetWidth`
 * greater than the viewport OR a right edge beyond `innerWidth`. The widget's
 * own host element (and its subtree) is always skipped.
 */
export function scan(
  doc: Document,
  host: HTMLElement | null,
  win: Window = window,
): HTMLElement[] {
  const viewport = getViewportWidth(win);
  const offenders: HTMLElement[] = [];
  const all = doc.querySelectorAll("*");
  for (const node of all) {
    if (host && (node === host || host.contains(node))) continue;
    const el = node as HTMLElement;
    // `display: none` and hidden elements have offsetWidth === 0 and are
    // filtered out naturally.
    if (
      el.offsetWidth > viewport ||
      isExceedingViewport(el, viewport)
    ) {
      // Skip elements that live inside an intentionally scrolling container
      // (overflow-x: auto|scroll) — those are not true page offenders.
      const scrollableParent = findScrollableAncestor(el);
      if (!scrollableParent) {
        offenders.push(el);
      }
    }
  }
  return offenders;
}

/** Short CSS path to an element, e.g. `body > section.hero > div.hero-content`. */
export function describe(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 5) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part += `#${node.id}`;
    } else if (node.classList && node.classList.length) {
      const classes = Array.from(node.classList);
      part += `.${classes.slice(0, 2).join(".")}`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

/** "1 element" / "3 elements". */
export function plural(n: number): string {
  return n === 1 ? "element" : "elements";
}

/** Summary of the first offending element for the tooltip. */
export function firstOffenderInfo(
  offenders: HTMLElement[],
  innerWidth: number,
): OffenderInfo | null {
  const el = offenders[0];
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const width = Math.round(Math.max(el.offsetWidth, rect.width));
  const excess = Math.round(rect.right - innerWidth);
  return { selector: describe(el), width, excess: Math.max(excess, 0) };
}

/**
 * Targets for MANUAL highlighting: automatic offenders plus top-level layout
 * containers (`header`/`footer`/`main`/`section`/`.container`/`.grid`/`.row`/
 * `*-wrap`/`*-container`), filtered to those whose content overflows their
 * bounds (scrollWidth > clientWidth) or that span the full viewport width. So
 * the hotkey produces visible outlines even when the auto-status is "OK".
 */
export function scanHighlightTargets(
  doc: Document,
  offenders: HTMLElement[],
  host: HTMLElement | null,
  viewport: number,
): Element[] {
  const candidates = new Set<Element>();

  // Top-level layout containers (direct children of body) — the "page
  // boundaries": header, div.hero, section.*, footer, wrappers, etc.
  for (const el of doc.querySelectorAll("body > *")) {
    if (host && (el === host || host.contains(el))) continue;
    candidates.add(el);
  }
  // Named layout containers (including nested ones).
  for (const el of doc.querySelectorAll(
    '.container, .layout, .grid, .row, [class*="wrap"], [class*="container"]',
  )) {
    if (host && (el === host || host.contains(el))) continue;
    candidates.add(el);
  }

  const targets = [...candidates].filter(
    (el) =>
      el.scrollWidth > el.clientWidth ||
      (el as HTMLElement).offsetWidth >= viewport ||
      isExceedingViewport(el, viewport),
  );
  // Automatic offenders are always added (even if they failed the filter above).
  for (const el of offenders) {
    if (!targets.includes(el)) targets.push(el);
  }
  return targets;
}

/**
 * Applies or removes highlight classes depending on `highlighted`.
 * MUTATION-SAFE: before add()/remove() it checks whether the class state
 * really changed, so in a stable layout a repeated scan does not touch the
 * DOM (no attribute flicker in DevTools, no observer feedback loop).
 */
export function applyHighlights(
  doc: Document,
  highlighted: boolean,
  offenders: HTMLElement[],
  host: HTMLElement | null,
  viewport: number,
): void {
  if (!highlighted) {
    // Turning the mode off: remove the manual highlight class, but preserve
    // .dcso-is-overflowing on actual detected offenders so the status
    // indicator is never wrong.
    const els = doc.querySelectorAll(".dcso-highlighted");
    for (const el of els) {
      el.classList.remove("dcso-highlighted");
    }
    return;
  }

  const targets = scanHighlightTargets(doc, offenders, host, viewport);
  const desired = new Set(targets);

  // Remove .dcso-highlighted from elements that fell out of the target set.
  for (const el of doc.querySelectorAll(".dcso-highlighted")) {
    if (!desired.has(el)) el.classList.remove("dcso-highlighted");
  }
  // Add .dcso-highlighted to new targets (only if the class is not there yet).
  for (const el of targets) {
    if (!el.classList.contains("dcso-highlighted")) {
      el.classList.add("dcso-highlighted");
    }
  }

  // Marker for automatic offenders (.dcso-is-overflowing) is a subset of
  // .dcso-highlighted.
  const auto = new Set<Element>(offenders);
  for (const el of doc.querySelectorAll(".dcso-is-overflowing")) {
    if (!auto.has(el)) el.classList.remove("dcso-is-overflowing");
  }
  for (const el of offenders) {
    if (
      el.classList.contains("dcso-highlighted") &&
      !el.classList.contains("dcso-is-overflowing")
    ) {
      el.classList.add("dcso-is-overflowing");
    }
  }
}

/* ==========================================================================
 * Hotkey helpers
 * ========================================================================== */

/** Parses a shortcut string like "Alt+O" or "Ctrl+Alt+O". */
export function parseHotkey(str: string): ParsedHotkey {
  const parts = String(str)
    .split("+")
    .map((p) => p.trim().toLowerCase());
  return {
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    meta: parts.includes("meta") || parts.includes("cmd"),
    key: parts[parts.length - 1] || "",
  };
}

/** Matches a keydown event against a parsed hotkey (supports e.key and e.code). */
export function matchesHotkey(e: KeyboardEvent, hotkey: ParsedHotkey): boolean {
  return (
    e.ctrlKey === !!hotkey.ctrl &&
    e.altKey === !!hotkey.alt &&
    e.shiftKey === !!hotkey.shift &&
    e.metaKey === !!hotkey.meta &&
    (e.key.toLowerCase() === hotkey.key ||
      e.code.toLowerCase() === `key${hotkey.key}`)
  );
}

/* ==========================================================================
 * Storage
 * ========================================================================== */

function load(key: string, fallback: string): string {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback; // localStorage unavailable (private mode) — use default
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable — silently skip */
  }
}

/** Sets textContent only when it actually changed (avoids needless DOM writes). */
function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/* ==========================================================================
 * Detector controller
 * ========================================================================== */

export class OverflowDetector implements DebugCssOverflowController {
  private readonly opts: ResolvedOptions;
  private readonly hlHotkey: ParsedHotkey;
  private readonly mnHotkey: ParsedHotkey;

  private _state: OverflowState = {
    pageOverflow: false,
    offenderCount: 0,
    viewportWidth: 0,
    overflowing: false,
  };
  private _highlighted = false;
  private _minimized: boolean;
  private _showMetricsBadge: boolean;
  private position: WidgetPosition;
  private accentColor: string;

  private widget: WidgetNodes | null = null;
  private domObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scanTimer = 0;
  private resizeEndTimer = 0;
  private _rafPending = false;
  private lastReportKey = "";
  private destroyed = false;

  constructor(options: DebugCssOverflowOptions = {}) {
    const hotkeys = { ...DEFAULT_OPTIONS.hotkeys, ...options.hotkeys };
    this.opts = { ...DEFAULT_OPTIONS, ...options, hotkeys } as ResolvedOptions;
    this.hlHotkey = parseHotkey(this.opts.hotkeys.toggleHighlight);
    this.mnHotkey = parseHotkey(this.opts.hotkeys.toggleMinimize);

    this.position = this.opts.position;
    this.accentColor = this.opts.accentColor;
    this._minimized = this.opts.minimized;
    this._showMetricsBadge = this.opts.showMetricsBadge;

    // Single source of truth: `enabled` in the options. When false, exit
    // immediately WITHOUT creating any DOM, styles, hotkeys, or observers.
    if (this.opts.enabled === false) {
      this.destroyed = true;
      return;
    }

    // Restore UI preferences from localStorage (falling back to the options).
    const prefix = this.opts.storagePrefix;
    const storedPosition = load(`${prefix}position`, this.position);
    if (WIDGET_POSITIONS.includes(storedPosition as WidgetPosition)) {
      this.position = storedPosition as WidgetPosition;
    }
    this.accentColor = load(`${prefix}accentColor`, this.accentColor);
    this._minimized =
      load(`${prefix}minimized`, String(this._minimized)) === "true";
    this._showMetricsBadge =
      load(`${prefix}showMetricsBadge`, String(this._showMetricsBadge)) === "true";

    injectPageStyles(document, this.accentColor);

    this.widget = buildWidgetHost(
      this.position,
      this.accentColor,
      this._minimized,
      this._showMetricsBadge,
      this.opts.hotkeys,
      this.opts.offset,
      {
        isMinimized: () => this._minimized,
        onSetMinimized: (m) => this.setMinimized(m),
        onDisable: () => this.handleDisable(),
        onCyclePosition: () => this.cyclePosition(),
        onAccentColor: (c) => this.setAccentColor(c),
        onToggleHighlight: () => this.toggleHighlight(),
        onToggleBadge: () => this.toggleMetricsBadge(),
      },
    );

    this.syncColorUi();

    window.addEventListener("keydown", this.onKeydown, true);
    window.addEventListener("resize", this.onResize);

    // Event-driven DOM monitoring instead of setInterval polling: node
    // insertion/removal (childList) plus class attribute changes — so
    // DevTools edits (e.g. disabling a negative margin) and dynamic content
    // trigger a recalc through a 150ms debounce. Our own highlighting is
    // mutation-safe (applyHighlights does not touch unchanged classes), so
    // the observer never loops on itself.
    //
    // We observe `document.documentElement` instead of `document.body` so
    // the script is safe to load in <head> without defer — the element is
    // always present at any document lifecycle stage.
    if (typeof MutationObserver !== "undefined") {
      this.domObserver = new MutationObserver(() => this.scheduleRefresh());
      this.domObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
    }
    // ResizeObserver catches layout shifts from element SIZE changes
    // (loaded content, fonts, dynamic blocks) with the same debounce.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh());
      this.resizeObserver.observe(document.documentElement);
    }

    this.refresh(); // initial scan on load

    console.info(
      `[debug-css-overflow] Active. ${this.opts.hotkeys.toggleHighlight} — toggle container outlines, ${this.opts.hotkeys.toggleMinimize} — collapse/expand widget.`,
    );
  }

  /* ----------------------------------------------------------------------
   * Controller getters
   * -------------------------------------------------------------------- */

  get state(): OverflowState {
    return { ...this._state };
  }

  get highlighted(): boolean {
    return this._highlighted;
  }

  get minimized(): boolean {
    return this._minimized;
  }

  /* ----------------------------------------------------------------------
   * Public controller methods
   * -------------------------------------------------------------------- */

  /** Re-scans the page and refreshes the widget immediately. */
  refresh(): void {
    if (this.destroyed) return;
    const win = window;
    const host = this.widget ? this.widget.host : null;

    // ── READ PHASE ── perform all layout-reading DOM queries first ──
    const pageOverflow = isPageOverflowing(win);
    const offenders = scan(document, host, win);
    const viewport = getViewportWidth(win);
    const changed =
      pageOverflow !== this._state.pageOverflow ||
      offenders.length !== this._state.offenderCount;

    this._state = {
      pageOverflow,
      offenderCount: offenders.length,
      viewportWidth: viewport,
      overflowing: pageOverflow || offenders.length > 0,
    };

    // ── WRITE PHASE ── batch all DOM mutations in a single animation frame
    // to avoid synchronous reflows between queries and widget updates.
    this.scheduleRafWrite(() => {
      this.report(offenders);
      this.updateWidget(offenders);
      applyHighlights(document, this._highlighted, offenders, host, viewport);
    });

    if (changed) this.notify();
  }

  toggleHighlight(): boolean {
    this.setHighlighted(!this._highlighted);
    return this._highlighted;
  }

  setHighlighted(highlighted: boolean): void {
    this._highlighted = highlighted;
    this.refresh(); // re-scan + apply/remove highlight classes
    const w = this.widget;
    if (w) {
      w.highlightBtn.classList.toggle("dcso-is-active", highlighted);
      w.highlightBtn.title = highlighted
        ? `Hide container outlines (${this.opts.hotkeys.toggleHighlight})`
        : `Toggle container outlines (${this.opts.hotkeys.toggleHighlight})`;
    }
    // The hotkey also expands a collapsed widget so the status is visible.
    if (highlighted && this._minimized) this.setMinimized(false);
  }

  toggleMinimized(): boolean {
    this.setMinimized(!this._minimized);
    return this._minimized;
  }

  setMinimized(minimized: boolean): void {
    this._minimized = minimized;
    save(`${this.opts.storagePrefix}minimized`, String(minimized));
    const host = this.widget ? this.widget.host : null;
    if (host) {
      host.classList.toggle("dcso-minimized", minimized);
      host.setAttribute("aria-expanded", String(!minimized));
    }
  }

  cyclePosition(): WidgetPosition {
    const index = WIDGET_POSITIONS.indexOf(this.position);
    this.position = WIDGET_POSITIONS[(index + 1) % WIDGET_POSITIONS.length]!;
    save(`${this.opts.storagePrefix}position`, this.position);
    const host = this.widget ? this.widget.host : null;
    if (host) {
      host.className = host.className.replace(/\bdcso-pos-\S+/g, "").trim();
      host.classList.add(`dcso-pos-${this.position}`);
    }
    return this.position;
  }

  setAccentColor(color: string): void {
    this.accentColor = color;
    save(`${this.opts.storagePrefix}accentColor`, color);
    document.documentElement.style.setProperty("--dcso-accent", color);
    this.syncColorUi();
  }

  toggleMetricsBadge(): boolean {
    this.setMetricsBadgeVisible(!this._showMetricsBadge);
    return this._showMetricsBadge;
  }

  setMetricsBadgeVisible(visible: boolean): void {
    this._showMetricsBadge = visible;
    save(`${this.opts.storagePrefix}showMetricsBadge`, String(visible));
    const host = this.widget ? this.widget.host : null;
    if (host) host.classList.toggle("dcso-hide-metrics", !visible);
    this.syncBadgeToggleUi();
  }

  /** Tears down the widget, observers, listeners, and injected styles. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this._highlighted = false;
    applyHighlights(document, false, [], this.widget ? this.widget.host : null, getViewportWidth(window));

    window.removeEventListener("keydown", this.onKeydown, true);
    window.removeEventListener("resize", this.onResize);
    window.clearTimeout(this.scanTimer);
    window.clearTimeout(this.resizeEndTimer);
    this._rafPending = false;

    this.domObserver?.disconnect();
    this.domObserver = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.widget && this.widget.host.parentNode) {
      this.widget.host.parentNode.removeChild(this.widget.host);
    }
    this.widget = null;

    removePageStyles(document);
  }

  /* ----------------------------------------------------------------------
   * Internal helpers
   * -------------------------------------------------------------------- */

  /** Applies/removes the accent color on the widget's color UI. */
  private syncColorUi(): void {
    const w = this.widget;
    if (!w) return;
    w.colorInput.value = normalizeColor(this.accentColor);
    w.highlightBtn.classList.toggle("dcso-is-active", this._highlighted);
    w.swatches.querySelectorAll(".dcso-swatch").forEach((node) => {
      const swatch = node as HTMLElement;
      swatch.classList.toggle(
        "dcso-is-active",
        swatch.dataset.color === this.accentColor,
      );
    });
  }

  /** Syncs the badge toggle button (👁) with the current visibility. */
  private syncBadgeToggleUi(): void {
    const w = this.widget;
    if (!w) return;
    w.badgeToggle.classList.toggle("dcso-is-active", this._showMetricsBadge);
    w.badgeToggle.setAttribute("aria-pressed", String(this._showMetricsBadge));
    w.badgeToggle.title = this._showMetricsBadge
      ? "Hide metrics badge in minimized state"
      : "Show metrics badge in minimized state";
  }

  /** Updates every dynamic widget text/class from the current scan. */
  private updateWidget(offenders: HTMLElement[]): void {
    const w = this.widget;
    if (!w) return;
    const count = offenders.length;
    const inner = window.innerWidth;
    const overflowing = this._state.overflowing;

    // classList.toggle(force) does not mutate the DOM when the state matches.
    w.host.classList.toggle("dcso-has-overflow", overflowing);
    // Explicit overflow class on the dot (important in the minimized state).
    w.dot.classList.toggle("dcso-dot--overflow", overflowing);

    // Badge/status: [viewport width]px · [status], e.g. "932px · OK".
    const statusText = this._state.pageOverflow
      ? `${inner}px · OVERFLOW`
      : count === 0
        ? `${inner}px · OK`
        : `${inner}px · ${count} overflowing`;
    setText(w.status, statusText);

    const tipText = this._state.pageOverflow
      ? "OVERFLOW — page scrolls horizontally"
      : count === 0
        ? "OK — no horizontal overflow"
        : `${count} ${plural(count)} overflowing`;
    setText(w.tooltipStatus, tipText);

    const vpText = `Viewport width: ${inner}px`;
    setText(w.tooltipViewport, vpText);

    // First-offender block in the tooltip (hidden when there are none).
    const info = overflowing ? firstOffenderInfo(offenders, inner) : null;
    w.tooltipOffender.classList.toggle("dcso-hidden", !info);
    if (info) {
      setText(w.tooltipOffLabel, `First offender: ${info.selector}`);
      setText(w.tooltipOffWidth, `— Element width: ${info.width}px`);
      setText(w.tooltipOffExcess, `— Overflow beyond viewport: +${info.excess}px`);
    } else {
      // Transition into a clean state: clear any "ghost" metrics.
      setText(w.tooltipOffLabel, "");
      setText(w.tooltipOffWidth, "");
      setText(w.tooltipOffExcess, "");
    }

    // Minimized badge: "1280px · +40px" (overflowing) or "1280px · OK".
    let badgeText: string;
    if (overflowing) {
      const offender = firstOffenderInfo(offenders, inner);
      const excess = offender
        ? offender.excess
        : Math.round(
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - inner,
          );
      badgeText = `${inner}px · +${Math.max(excess, 0)}px`;
    } else {
      badgeText = `${inner}px · OK`;
    }
    setText(w.badge, badgeText);
  }

  /** Prints offender details to the browser console (deduplicated). */
  private report(offenders: HTMLElement[]): void {
    const key = offenders
      .map((el) => `${describe(el)}:${el.offsetWidth}`)
      .join("|");
    if (key === this.lastReportKey) return; // don't spam identical reports
    this.lastReportKey = key;

    if (offenders.length === 0) return;

    const inner = window.innerWidth;
    console.warn(
      `[debug-css-overflow] Horizontal overflow: ${offenders.length} ${plural(offenders.length)} beyond the viewport (${inner}px):`,
    );
    for (const el of offenders) {
      const label = describe(el);
      const rect = el.getBoundingClientRect();
      console.warn(
        `%c${label}%c  →  rect.right: ${rect.right.toFixed(1)}px / offsetWidth: ${el.offsetWidth}px  >  innerWidth: ${inner}px`,
        `color:${this.accentColor};font-weight:bold`,
        "color:inherit",
        el, // clickable reference to the element in DevTools
      );
    }
  }

  /** Dispatches `onChange` and the custom change event when state changed. */
  private notify(): void {
    const state = this.state;
    this.opts.onChange?.(state);
    document.dispatchEvent(
      new CustomEvent<OverflowState>(OVERFLOW_CHANGE_EVENT, { detail: state }),
    );
  }

  /** Debounced scan trigger (150ms for resize / MutationObserver bursts). */
  private scheduleRefresh(ms = 150): void {
    window.clearTimeout(this.scanTimer);
    this.scanTimer = window.setTimeout(() => this.refresh(), ms);
  }

  /**
   * Batches DOM writes into a single animation frame to prevent layout
   * thrashing.  Falls back to synchronous execution in environments without
   * requestAnimationFrame (e.g. jsdom in tests).
   */
  private scheduleRafWrite(fn: () => void): void {
    if (!IS_JSDOM && typeof requestAnimationFrame !== "undefined") {
      if (this._rafPending) return; // coalesce: the pending frame will see the latest state
      this._rafPending = true;
      requestAnimationFrame(() => {
        this._rafPending = false;
        fn();
      });
    } else {
      // Synchronous fallback: jsdom (tests) or environments without rAF.
      fn();
    }
  }

  private onResize = (): void => {
    this.scheduleRefresh(150);

    // While actively resizing, Chrome DevTools shows a native [W x H] overlay
    // at the top of the window. Mark the widget with .dcso-resizing so a
    // top-right widget drops to top: 32px; the class is removed 500ms after
    // the last resize event.
    const host = this.widget ? this.widget.host : null;
    if (host) {
      host.classList.add("dcso-resizing");
      window.clearTimeout(this.resizeEndTimer);
      this.resizeEndTimer = window.setTimeout(() => {
        host.classList.remove("dcso-resizing");
      }, 500);
    }
  };

  private onKeydown = (e: KeyboardEvent): void => {
    // Alt+O — toggle container outline highlights
    if (matchesHotkey(e, this.hlHotkey)) {
      e.preventDefault();
      this.toggleHighlight();
      return;
    }
    // Ctrl+Alt+O — collapse/expand the widget to a dot (Ctrl instead of
    // Shift so the keyboard layout doesn't switch while developing)
    if (matchesHotkey(e, this.mnHotkey)) {
      e.preventDefault();
      this.toggleMinimized();
    }
  };

  /**
   * Disabling for the CURRENT SESSION: remove highlights, the widget, the
   * listeners, and the observers. Nothing is written to localStorage — the
   * source of truth for enablement is the `enabled` option passed to
   * {@link initDebugCssOverflow}.
   */
  private handleDisable(): void {
    const shadow = this.widget ? this.widget.shadow : null;
    if (!shadow) return;
    buildDisableModal(shadow, () => {
      this.destroy();
      console.info(
        "[debug-css-overflow] Disabled for the current session. Call initDebugCssOverflow({ enabled: false }) to disable permanently.",
      );
    });
  }
}
