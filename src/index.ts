/**
 * `debug-css-overflow` — public entry point.
 *
 * A zero-dependency dev utility that detects horizontal overflow (overflow-x),
 * highlights offending elements, and shows a small Shadow-DOM widget.
 *
 * Typical usage (dev-only):
 *
 * ```ts
 * import { initDebugCssOverflow } from "debug-css-overflow";
 *
 * if (import.meta.env.DEV) {
 *   initDebugCssOverflow({ position: "top-right" });
 * }
 * ```
 *
 * The module has no import-time side effects and never touches the DOM until
 * {@link initDebugCssOverflow} is called, so it is safe to import from any
 * environment (and fully tree-shaken out of production bundles).
 */

import { OverflowDetector, OVERFLOW_CHANGE_EVENT } from "./detector";
import { ACCENT_PRESETS, DEFAULT_OPTIONS, WIDGET_POSITIONS } from "./types";
import type {
  DebugCssOverflowController,
  DebugCssOverflowHotkeys,
  DebugCssOverflowOptions,
  OffenderInfo,
  OverflowState,
  WidgetOffset,
  WidgetPosition,
} from "./types";

export {
  ACCENT_PRESETS,
  DEFAULT_OPTIONS,
  OVERFLOW_CHANGE_EVENT,
  OverflowDetector,
  WIDGET_POSITIONS,
};
export { maxOverflowOf } from "./detector";

export type {
  DebugCssOverflowController,
  DebugCssOverflowHotkeys,
  DebugCssOverflowOptions,
  OffenderInfo,
  OverflowState,
  WidgetOffset,
  WidgetPosition,
};

/** The currently active detector (singleton). */
let activeDetector: OverflowDetector | null = null;

/** The options of the last initialized detector, for Astro re-initialization. */
let lastInitOptions: DebugCssOverflowOptions | null = null;

/** Whether the Astro View Transitions lifecycle listeners are already wired. */
let astroLifecycleWired = false;

/** Tears down the active detector without forgetting the Astro re-init options. */
function destroyActiveDetector(): void {
  activeDetector?.destroy();
  activeDetector = null;
}

/**
 * Wires the Astro ClientRouter lifecycle (View Transitions) once:
 *
 *   * `astro:after-swap` — the swapped-out document content discarded the
 *     widget host, so tear down the stale detector instance (observers,
 *     listeners, and any detached nodes). An instance that was ALREADY
 *     destroyed before the swap — the widget's "disable for this session"
 *     button, or an app calling `controller.destroy()` directly — is
 *     honored: its options are forgotten so the next `astro:page-load`
 *     never resurrects it.
 *   * `astro:page-load` — a fresh detector is created for the "new" page —
 *     but ONLY when there is none. Apps that re-initialize the detector
 *     themselves on `astro:page-load` (e.g. recomputing `offset.top` from
 *     the CURRENT rendered header height) register their listener before
 *     ours, so their instance is already mounted when this handler runs.
 *     Destroying it in favor of `lastInitOptions` would replace a freshly
 *     computed dynamic offset with a stale one and leave every controller
 *     reference the app holds pointing at a destroyed instance (its
 *     `setOffset()` calls would silently no-op). Skipping keeps the
 *     handler order-independent: with a live detector present we adopt it,
 *     without one we re-create from the last options.
 *
 * The listeners are only attached after the first successful init and never
 * touch `document` on the server, so importing the module stays side-effect
 * free outside the browser.
 */
function wireAstroLifecycle(): void {
  if (astroLifecycleWired || typeof document === "undefined") return;
  astroLifecycleWired = true;

  document.addEventListener("astro:after-swap", () => {
    // An already-inert instance means the app (or the user, via the
    // widget's disable button) tore it down deliberately — forget the
    // options so the next page-load does not resurrect it.
    if (activeDetector !== null && activeDetector.destroyed) {
      lastInitOptions = null;
    }
    destroyActiveDetector();
  });

  document.addEventListener("astro:page-load", () => {
    if (activeDetector !== null) {
      if (activeDetector.destroyed) lastInitOptions = null;
      return; // the app already re-initialized this "page" — adopt its instance
    }
    if (lastInitOptions === null) return;
    activeDetector = new OverflowDetector(lastInitOptions);
  });
}

/**
 * Initializes the overflow detector and returns a controller, or `null` when
 * `enabled: false` (in which case nothing is created at all).
 *
 * Calling this again replaces the previous instance with the new options.
 */
export function initDebugCssOverflow(
  options: DebugCssOverflowOptions = {},
): DebugCssOverflowController | null {
  const enabled = options.enabled ?? DEFAULT_OPTIONS.enabled;
  if (enabled === false) {
    destroyActiveDetector();
    lastInitOptions = null;
    return null;
  }
  destroyActiveDetector();
  lastInitOptions = options;
  activeDetector = new OverflowDetector(options);
  wireAstroLifecycle();
  return activeDetector;
}

/** Destroys the active detector (if any) and removes the widget. */
export function destroyDebugCssOverflow(): void {
  destroyActiveDetector();
  lastInitOptions = null;
}
