/**
 * Tests for `debug-css-overflow`.
 *
 * The unit tests operate ONLY on pure, abstract DOM geometry: elements are
 * created dynamically and their geometry (offsetWidth / getBoundingClientRect /
 * scrollWidth) is stubbed relative to `window.innerWidth`. No application CSS
 * selectors, negative margins, or framework traits are referenced.
 *
 * The E2E tests exercise the public API end-to-end inside a jsdom document:
 * widget creation (Shadow DOM), state changes, events/callbacks, the
 * minimized badge toggle, and teardown.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  destroyDebugCssOverflow,
  initDebugCssOverflow,
  OVERFLOW_CHANGE_EVENT,
} from "../src/index";
import {
  describe as describeEl,
  getViewportWidth,
  isExceedingViewport,
  isPageOverflowing,
  matchesHotkey,
  parseHotkey,
  scan,
} from "../src/detector";

/* --------------------------------------------------------------------------
 * Geometry stubbing helpers (pure abstract geometry)
 * ------------------------------------------------------------------------ */

function setInnerWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
    writable: true,
  });
}

function stubScrollWidth(el: Element, width: number): void {
  Object.defineProperty(el, "scrollWidth", {
    value: width,
    configurable: true,
  });
}

function stubOffsetWidth(el: Element, width: number): void {
  Object.defineProperty(el, "offsetWidth", {
    value: width,
    configurable: true,
  });
}

function stubRectRight(el: Element, right: number): void {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right,
      bottom: 0,
      width: right,
      height: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

/* --------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeEach(() => {
  destroyDebugCssOverflow();
  document.body.innerHTML = "";
  for (const s of Array.from(document.head.querySelectorAll("style"))) {
    s.remove();
  }
  localStorage.clear();
  setInnerWidth(1024);
  // Reset the stubbed geometry from previous tests.
  stubScrollWidth(document.documentElement, 0);
  stubScrollWidth(document.body, 0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  destroyDebugCssOverflow();
  vi.restoreAllMocks();
});

/* --------------------------------------------------------------------------
 * Unit: viewport / page-overflow math
 * ------------------------------------------------------------------------ */

describe("viewport and page-overflow math", () => {
  it("falls back to innerWidth when clientWidth is unavailable", () => {
    setInnerWidth(800);
    expect(getViewportWidth(window)).toBe(800);
  });

  it("reports page overflow when documentElement is wider than the viewport", () => {
    setInnerWidth(800);
    stubScrollWidth(document.documentElement, 1200);
    expect(isPageOverflowing(window)).toBe(true);
  });

  it("reports page overflow when body is wider than the viewport", () => {
    setInnerWidth(800);
    stubScrollWidth(document.body, 1600);
    expect(isPageOverflowing(window)).toBe(true);
  });

  it("reports no overflow when everything fits", () => {
    setInnerWidth(1600);
    stubScrollWidth(document.documentElement, 800);
    stubScrollWidth(document.body, 800);
    expect(isPageOverflowing(window)).toBe(false);
  });
});

describe("isExceedingViewport", () => {
  it("applies a 1px tolerance for subpixel rendering", () => {
    setInnerWidth(1000);
    const el = document.createElement("div");
    stubRectRight(el, 1001); // right edge == innerWidth + 1 → allowed
    expect(isExceedingViewport(el, window.innerWidth)).toBe(false);
    stubRectRight(el, 1002); // right edge beyond the tolerance → offender
    expect(isExceedingViewport(el, window.innerWidth)).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * Unit: scan()
 * ------------------------------------------------------------------------ */

describe("scan", () => {
  it("collects elements whose right edge exceeds the viewport", () => {
    setInnerWidth(800);
    const el = document.createElement("div");
    document.body.appendChild(el);
    stubRectRight(el, 900);
    const offenders = scan(document, null);
    expect(offenders).toContain(el);
  });

  it("collects elements wider than the viewport (offsetWidth)", () => {
    setInnerWidth(800);
    const el = document.createElement("div");
    document.body.appendChild(el);
    stubOffsetWidth(el, 1200);
    stubRectRight(el, 500);
    const offenders = scan(document, null);
    expect(offenders).toContain(el);
  });

  it("ignores elements fully inside the viewport", () => {
    setInnerWidth(800);
    const el = document.createElement("div");
    document.body.appendChild(el);
    stubOffsetWidth(el, 400);
    stubRectRight(el, 700);
    expect(scan(document, null)).not.toContain(el);
  });

  it("skips the widget host subtree", () => {
    setInnerWidth(800);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const inner = document.createElement("div");
    host.appendChild(inner);
    stubRectRight(inner, 900);
    expect(scan(document, host)).not.toContain(inner);
    expect(scan(document, host)).not.toContain(host);
  });

  it("skips elements inside an intentionally scrollable container (overflow-x: auto)", () => {
    setInnerWidth(800);
    const scrollable = document.createElement("div");
    scrollable.style.overflowX = "auto";
    document.body.appendChild(scrollable);
    const child = document.createElement("div");
    scrollable.appendChild(child);
    stubOffsetWidth(child, 1200);
    stubRectRight(child, 500);
    // getComputedStyle returns "auto" for overflowX on the parent, so the
    // child is inside a scrolling container and should not be flagged.
    expect(scan(document, null)).not.toContain(child);
  });

  it("skips elements inside an intentionally scrollable container (overflow-x: scroll)", () => {
    setInnerWidth(800);
    const scrollable = document.createElement("div");
    scrollable.style.overflowX = "scroll";
    document.body.appendChild(scrollable);
    const child = document.createElement("div");
    scrollable.appendChild(child);
    stubOffsetWidth(child, 1200);
    stubRectRight(child, 500);
    expect(scan(document, null)).not.toContain(child);
  });

  it("produces human-readable selectors and hotkey parsing", () => {
    const el = document.createElement("section");
    el.id = "hero";
    expect(describeEl(el)).toBe("section#hero");

    const altO = parseHotkey("Alt+O");
    const withAlt = new KeyboardEvent("keydown", { key: "o", altKey: true });
    const withCtrlToo = new KeyboardEvent("keydown", {
      key: "o",
      altKey: true,
      ctrlKey: true,
    });
    expect(matchesHotkey(withAlt, altO)).toBe(true);
    expect(matchesHotkey(withCtrlToo, altO)).toBe(false);
  });
});

/* --------------------------------------------------------------------------
 * E2E: public API
 * ------------------------------------------------------------------------ */

describe("initDebugCssOverflow", () => {
  it("returns null and creates nothing when enabled is false", () => {
    const controller = initDebugCssOverflow({ enabled: false });
    expect(controller).toBeNull();
    expect(document.getElementById("dcso-host")).toBeNull();
    expect(document.getElementById("dcso-page-styles")).toBeNull();
  });

  it("creates a Shadow DOM widget and reports offenders through the API", () => {
    setInnerWidth(800);
    const controller = initDebugCssOverflow({
      position: "top-right",
      storagePrefix: "test:",
    });
    expect(controller).not.toBeNull();

    const host = document.getElementById("dcso-host");
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
    expect(host!.classList.contains("dcso-pos-top-right")).toBe(true);

    // The widget is fully isolated: nothing leaks into the light DOM.
    expect(document.querySelector(".dcso-badge")).toBeNull();
    expect(host!.shadowRoot!.querySelector(".dcso-badge")).not.toBeNull();

    // Now create an element whose right edge exceeds the viewport.
    const el = document.createElement("div");
    document.body.appendChild(el);
    stubRectRight(el, 1000);

    controller!.refresh();
    expect(controller!.state.offenderCount).toBe(1);
    expect(controller!.state.overflowing).toBe(true);
    expect(controller!.state.viewportWidth).toBe(800);

    const status = host!.shadowRoot!.querySelector(".dcso-status");
    expect(status?.textContent).toContain("800px");
  });

  it("invokes onChange and dispatches a change event when overflow state changes", () => {
    setInnerWidth(800);
    const onChange = vi.fn();
    const listener = vi.fn();
    document.addEventListener(OVERFLOW_CHANGE_EVENT, listener);

    const controller = initDebugCssOverflow({
      onChange,
      storagePrefix: "test:",
    });
    // Initial scan is clean: no event fired.
    expect(onChange).not.toHaveBeenCalled();

    const el = document.createElement("div");
    document.body.appendChild(el);
    stubRectRight(el, 1200);
    controller!.refresh();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ overflowing: true, offenderCount: 1 }),
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ overflowing: true }),
      }),
    );

    document.removeEventListener(OVERFLOW_CHANGE_EVENT, listener);
  });

  it("toggles container highlighting via the controller and the Alt+O hotkey", () => {
    setInnerWidth(800);
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    expect(controller).not.toBeNull();

    const el = document.createElement("div");
    document.body.appendChild(el);
    stubRectRight(el, 1000);

    // Controller method.
    controller!.setHighlighted(true);
    expect(controller!.highlighted).toBe(true);
    expect(el.classList.contains("dcso-highlighted")).toBe(true);
    expect(el.classList.contains("dcso-is-overflowing")).toBe(true);

    // Keyboard shortcut (Alt+O).
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "o",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller!.highlighted).toBe(false);
    expect(el.classList.contains("dcso-highlighted")).toBe(false);
  });

  it("preserves .dcso-is-overflowing on real offenders when highlight is toggled off", () => {
    setInnerWidth(800);
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    expect(controller).not.toBeNull();

    const el = document.createElement("div");
    document.body.appendChild(el);
    stubRectRight(el, 1000);

    // Enable highlighting — both classes should appear.
    controller!.setHighlighted(true);
    expect(el.classList.contains("dcso-highlighted")).toBe(true);
    expect(el.classList.contains("dcso-is-overflowing")).toBe(true);

    // Disable highlighting — .dcso-highlighted is removed, but
    // .dcso-is-overflowing stays because el is a real offender.
    controller!.setHighlighted(false);
    expect(el.classList.contains("dcso-highlighted")).toBe(false);
    expect(el.classList.contains("dcso-is-overflowing")).toBe(true);
  });

  it("hides the metrics badge in minimized state when the toggle is off", () => {
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    expect(controller).not.toBeNull();
    const host = document.getElementById("dcso-host")!;

    // Default: badge visible when minimized.
    controller!.setMinimized(true);
    expect(host.classList.contains("dcso-minimized")).toBe(true);
    expect(host.classList.contains("dcso-hide-metrics")).toBe(false);

    // Toggle off: only the status dot remains visible.
    controller!.setMetricsBadgeVisible(false);
    expect(host.classList.contains("dcso-hide-metrics")).toBe(true);
    expect(controller!.toggleMetricsBadge()).toBe(true);
    expect(host.classList.contains("dcso-hide-metrics")).toBe(false);

    // The stylesheet must contain the hard rule that hides the badge (the
    // inline metric text) completely in the minimized + hidden state.
    const styleText = host.shadowRoot!.querySelector("style")?.textContent ?? "";
    expect(styleText).toContain(
      ":host(.dcso-minimized.dcso-hide-metrics) .dcso-badge",
    );
    expect(styleText).toContain("display: none !important");
  });

  it("applies the offset option to the widget host", () => {
    const controller = initDebugCssOverflow({
      position: "top-right",
      offset: { top: 64, right: 24 },
      storagePrefix: "test:",
    });
    expect(controller).not.toBeNull();
    const host = document.getElementById("dcso-host")!;

    // Provided edges are set as custom properties on the host...
    expect(host.style.getPropertyValue("--dcso-offset-top")).toBe("64px");
    expect(host.style.getPropertyValue("--dcso-offset-right")).toBe("24px");
    // ...while untouched edges keep the default 12px gutter.
    expect(host.style.getPropertyValue("--dcso-offset-bottom")).toBe("");
    expect(host.style.getPropertyValue("--dcso-offset-left")).toBe("");

    // The corner styles consume the variables with a 12px fallback.
    const styleText = host.shadowRoot!.querySelector("style")?.textContent ?? "";
    expect(styleText).toContain("top: var(--dcso-offset-top, 12px)");
    expect(styleText).toContain("right: var(--dcso-offset-right, 12px)");
    expect(styleText).toContain("bottom: var(--dcso-offset-bottom, 12px)");
  });

  it("keeps the default gutter when no offset is given", () => {
    initDebugCssOverflow({ position: "top-right", storagePrefix: "test:" });
    const host = document.getElementById("dcso-host")!;
    expect(host.style.getPropertyValue("--dcso-offset-top")).toBe("");
    expect(host.style.getPropertyValue("--dcso-offset-right")).toBe("");
  });

  it("persists UI preferences to localStorage", () => {
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    expect(controller).not.toBeNull();
    controller!.cyclePosition();
    controller!.setAccentColor("#00ff88");
    expect(localStorage.getItem("test:position")).toBe("top-left");
    expect(localStorage.getItem("test:accentColor")).toBe("#00ff88");
    expect(controller!.cyclePosition()).toBe("bottom-left");
  });

  it("cleans up the DOM and highlight classes on destroy", () => {
    setInnerWidth(800);
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    expect(controller).not.toBeNull();

    const el = document.createElement("div");
    document.body.appendChild(el);
    stubRectRight(el, 1000);
    controller!.setHighlighted(true);
    expect(el.classList.contains("dcso-highlighted")).toBe(true);

    controller!.destroy();
    expect(document.getElementById("dcso-host")).toBeNull();
    expect(document.getElementById("dcso-page-styles")).toBeNull();
    expect(el.classList.contains("dcso-highlighted")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--dcso-accent")).toBe("");
  });

  it("re-initializing with new options replaces the previous instance", () => {
    initDebugCssOverflow({ storagePrefix: "test:" });
    expect(document.getElementById("dcso-host")).not.toBeNull();

    initDebugCssOverflow({ storagePrefix: "test:" });
    expect(document.getElementById("dcso-host")).not.toBeNull();
    // Only one host exists.
    expect(document.querySelectorAll("#dcso-host").length).toBe(1);

    destroyDebugCssOverflow();
    expect(document.getElementById("dcso-host")).toBeNull();
  });
});
