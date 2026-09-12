/**
 * Public type definitions and default configuration for `debug-css-overflow`.
 *
 * This file only ships types plus a few plain constants — it never touches the
 * DOM, so it is safe to import from any environment (SSR, tests, bundlers).
 */

/** Corner of the viewport the floating widget is pinned to. */
export type WidgetPosition =
  | "top-right"
  | "top-left"
  | "bottom-left"
  | "bottom-right";

/**
 * Per-edge displacement (in px) applied to the widget's default corner
 * gutter. Only the edges that match the current {@link WidgetPosition} are
 * used — e.g. `{ top: 64 }` pushes a top-positioned widget down below a
 * fixed header while leaving bottom corners at their default gutter.
 */
export interface WidgetOffset {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Rotational order used by the widget's "rotate corner" button. */
export const WIDGET_POSITIONS: readonly WidgetPosition[] = [
  "top-right",
  "top-left",
  "bottom-left",
  "bottom-right",
];

/** Accent color presets offered in the widget's swatch row. */
export const ACCENT_PRESETS: readonly string[] = [
  "#ff0055", // pink-red (default)
  "#ffe600", // yellow (dark themes)
  "#00f0ff", // cyan (dark themes)
  "#00ff88", // green (dark themes)
  "#ff9100", // orange (light themes)
  "#000000", // black (light themes)
];

/** Keyboard shortcut definitions, written like "Alt+O". */
export interface DebugCssOverflowHotkeys {
  /** Toggle container outline highlights. Default: "Alt+O". */
  toggleHighlight?: string;
  /** Toggle the collapsed dot state. Default: "Ctrl+Alt+O". */
  toggleMinimize?: string;
}

/**
 * Options accepted by {@link initDebugCssOverflow}. Every field is optional;
 * missing fields fall back to {@link DEFAULT_OPTIONS}.
 */
export interface DebugCssOverflowOptions {
  /**
   * Global activation flag. When `false` the detector is never initialized:
   * no host element, styles, hotkey listeners, or observers are created.
   * Default: `true`.
   */
  enabled?: boolean;
  /** Start collapsed into a dot. Default: `false`. */
  minimized?: boolean;
  /** Corner placement of the widget. Default: `"top-right"`. */
  position?: WidgetPosition;
  /**
   * Displace the widget from the viewport edge (px), overriding the default
   * 12px gutter for the edges given — e.g. `{ top: 64 }` clears a fixed
   * top navbar. Only edges matching the current position are applied.
   * Default: `{}`.
   */
  offset?: WidgetOffset;
  /** Accent color for highlight outlines and the widget UI. Default: `"#ff0055"`. */
  accentColor?: string;
  /** Show the compact metrics badge next to the dot when minimized. Default: `true`. */
  showMetricsBadge?: boolean;
  /** Keyboard shortcut configuration. */
  hotkeys?: DebugCssOverflowHotkeys;
  /**
   * Prefix for localStorage keys used to persist UI preferences
   * (position, accent color, minimized state, badge visibility).
   * Default: `"dcso:"`.
   */
  storagePrefix?: string;
  /** Called whenever the overflow state changes. */
  onChange?: (state: OverflowState) => void;
}

/** A snapshot of the current overflow state. */
export interface OverflowState {
  /** True when the whole page scrolls horizontally (`scrollWidth > innerWidth`). */
  readonly pageOverflow: boolean;
  /** Number of individual elements detected beyond the viewport. */
  readonly offenderCount: number;
  /** Current viewport width in pixels. */
  readonly viewportWidth: number;
  /** True when the page overflows OR at least one offender exists. */
  readonly overflowing: boolean;
}

/**
 * Human-readable summary of the top (rightmost) offending element — the
 * one whose right edge defines the page's maximum overflow.
 */
export interface OffenderInfo {
  /** Short CSS path, e.g. `body > section.hero > div.hero-content`. */
  readonly selector: string;
  /** Approximate element width in pixels. */
  readonly width: number;
  /**
   * Right-edge x coordinate in viewport pixels. Shown alongside the width
   * when the element is offset/transformed (`width` alone would hide where
   * the element actually ends, and the excess derives from this value).
   */
  readonly rightEdge: number;
  /** How many pixels the element sticks out beyond the viewport. */
  readonly excess: number;
}

/**
 * Controller returned by {@link initDebugCssOverflow}. All mutating methods
 * keep the widget, persisted preferences, and highlight classes in sync.
 */
export interface DebugCssOverflowController {
  /** Current overflow state (read-only snapshot). */
  readonly state: OverflowState;
  /** Whether container-outline highlighting is currently active. */
  readonly highlighted: boolean;
  /** Whether the widget is collapsed to a dot. */
  readonly minimized: boolean;
  /**
   * Whether this instance was torn down ({@link destroy} ran, or it was
   * created with `enabled: false` and never mounted anything). A destroyed
   * controller stays safe to hold: every method is a no-op.
   */
  readonly destroyed: boolean;
  /** Re-scan the page and refresh the widget immediately. */
  refresh(): void;
  /** Toggle container-outline highlighting; returns the new value. */
  toggleHighlight(): boolean;
  /** Explicitly enable or disable container-outline highlighting. */
  setHighlighted(highlighted: boolean): void;
  /** Toggle the collapsed dot state; returns the new value. */
  toggleMinimized(): boolean;
  /** Collapse or expand the widget explicitly. */
  setMinimized(minimized: boolean): void;
  /** Rotate the widget to the next corner; returns the new position. */
  cyclePosition(): WidgetPosition;
  /** Change the accent color used for highlights and the widget. */
  setAccentColor(color: string): void;
  /**
   * Update the widget's per-edge offset in place — e.g. follow a fixed
   * navbar whose tabs wrap into multiple lines after a resize.
   */
  setOffset(offset: WidgetOffset): void;
  /** Toggle the metrics badge in the minimized state; returns the new value. */
  toggleMetricsBadge(): boolean;
  /** Show or hide the metrics badge in the minimized state. */
  setMetricsBadgeVisible(visible: boolean): void;
  /** Tear down the widget, observers, listeners, and injected styles. */
  destroy(): void;
}

/**
 * Default configuration. This is the single source of truth for every option
 * that is not explicitly provided to {@link initDebugCssOverflow}.
 */
export const DEFAULT_OPTIONS: Required<
  Omit<DebugCssOverflowOptions, "onChange">
> &
  Pick<DebugCssOverflowOptions, "onChange"> = {
  enabled: true,
  minimized: false,
  position: "top-right",
  offset: {},
  accentColor: "#ff0055",
  showMetricsBadge: true,
  hotkeys: {
    toggleHighlight: "Alt+O",
    toggleMinimize: "Ctrl+Alt+O",
  },
  storagePrefix: "dcso:",
};
