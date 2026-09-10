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
    activeDetector?.destroy();
    activeDetector = null;
    return null;
  }
  activeDetector?.destroy();
  activeDetector = new OverflowDetector(options);
  return activeDetector;
}

/** Destroys the active detector (if any) and removes the widget. */
export function destroyDebugCssOverflow(): void {
  activeDetector?.destroy();
  activeDetector = null;
}
