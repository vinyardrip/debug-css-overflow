/**
 * Astro View Transitions (ClientRouter) lifecycle tests.
 *
 * The library wires its own `astro:after-swap` / `astro:page-load` listeners
 * on the first successful init, so the widget survives ClientRouter
 * navigations automatically. These tests pin the two contracts that matter
 * for apps layering their OWN lifecycle handlers on top (see the /astro/
 * playground route):
 *
 *   1. Order independence — the app's `astro:page-load` handler (typically
 *      `initDebugCssOverflow({ offset: { top: <current header height> } })`)
 *      may run BEFORE or AFTER the library's. The app-held controller must
 *      stay LIVE in both orders, so the app's header-following
 *      `setOffset()` calls keep working; the freshly computed dynamic
 *      offset must never be replaced by stale options.
 *   2. Session-disable respect — a detector destroyed deliberately (the
 *      widget's "disable for this session" button or a direct
 *      `controller.destroy()`) must NOT be resurrected by later lifecycle
 *      events.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  destroyDebugCssOverflow,
  initDebugCssOverflow,
} from "../src/index";
import type { DebugCssOverflowController } from "../src/index";

/** Removes every listener a test attached to `document`. */
const cleanups: Array<() => void> = [];

function onPageLoad(handler: () => void): void {
  document.addEventListener("astro:page-load", handler);
  cleanups.push(() =>
    document.removeEventListener("astro:page-load", handler),
  );
}

function onAfterSwap(handler: () => void): void {
  document.addEventListener("astro:after-swap", handler);
  cleanups.push(() =>
    document.removeEventListener("astro:after-swap", handler),
  );
}

/** `--dcso-offset-top` as rendered on the widget host (px, or 0 = default). */
function hostOffsetTop(): string {
  return (
    document
      .getElementById("dcso-host")
      ?.style.getPropertyValue("--dcso-offset-top") ?? ""
  );
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  destroyDebugCssOverflow();
  document.body.innerHTML = "";
  for (const s of Array.from(document.head.querySelectorAll("style"))) {
    s.remove();
  }
  localStorage.clear();
});

describe("Astro View Transitions lifecycle", () => {
  it("astro:after-swap tears down the active instance", () => {
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    expect(controller).not.toBeNull();
    expect(document.querySelectorAll("#dcso-host").length).toBe(1);

    document.dispatchEvent(new Event("astro:after-swap"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(0);
    expect(controller!.destroyed).toBe(true);
  });

  it("astro:page-load revives a torn-down instance without duplicating hosts", () => {
    initDebugCssOverflow({ storagePrefix: "test:" });
    expect(document.querySelectorAll("#dcso-host").length).toBe(1);

    document.dispatchEvent(new Event("astro:after-swap"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(0);

    document.dispatchEvent(new Event("astro:page-load"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(1);

    // Firing again does not accumulate duplicates.
    document.dispatchEvent(new Event("astro:page-load"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(1);
    expect(document.querySelectorAll("#dcso-page-styles").length).toBe(1);
  });

  it("revives with the stored options (offset survives the navigation)", () => {
    initDebugCssOverflow({
      storagePrefix: "test:",
      offset: { top: 96 },
    });
    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));

    expect(hostOffsetTop()).toBe("96px");
  });
});

describe("listener-order independence (app re-init on astro:page-load)", () => {
  it("app listener BEFORE the library's: the app-held controller stays live", () => {
    let held: DebugCssOverflowController | null = null;

    // Mirrors tests_plugin/astro/main.ts: the module attaches its page-load
    // listener during evaluation, BEFORE the first init wires the library's.
    onPageLoad(() => {
      held = initDebugCssOverflow({
        storagePrefix: "test:",
        offset: { top: 100 },
      });
    });
    initDebugCssOverflow({ storagePrefix: "test:", offset: { top: 50 } });

    document.dispatchEvent(new Event("astro:page-load"));

    expect(document.querySelectorAll("#dcso-host").length).toBe(1);
    expect(held).not.toBeNull();
    expect(held!.destroyed).toBe(false); // NOT replaced by the library
    // The dynamically recomputed offset wins — never the stale boot value.
    expect(hostOffsetTop()).toBe("100px");

    // The live instance still accepts in-place offset updates (the
    // header-following ResizeObserver path).
    held!.setOffset({ top: 200 });
    expect(hostOffsetTop()).toBe("200px");
  });

  it("app listener AFTER the library's: the app-held controller stays live", () => {
    let held: DebugCssOverflowController | null = null;

    initDebugCssOverflow({ storagePrefix: "test:", offset: { top: 50 } });
    onPageLoad(() => {
      held = initDebugCssOverflow({
        storagePrefix: "test:",
        offset: { top: 100 },
      });
    });

    document.dispatchEvent(new Event("astro:page-load"));

    expect(document.querySelectorAll("#dcso-host").length).toBe(1);
    expect(held).not.toBeNull();
    expect(held!.destroyed).toBe(false);
    expect(hostOffsetTop()).toBe("100px");
  });

  it("full navigation (after-swap → page-load) with an app re-init listener", () => {
    let held: DebugCssOverflowController | null = null;

    onPageLoad(() => {
      held = initDebugCssOverflow({
        storagePrefix: "test:",
        offset: { top: 120 },
      });
    });
    initDebugCssOverflow({ storagePrefix: "test:", offset: { top: 50 } });

    // The ClientRouter order: swap discards the host, then a fresh boot.
    document.dispatchEvent(new Event("astro:after-swap"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(0);
    document.dispatchEvent(new Event("astro:page-load"));

    expect(document.querySelectorAll("#dcso-host").length).toBe(1);
    expect(held).not.toBeNull();
    expect(held!.destroyed).toBe(false);
    expect(hostOffsetTop()).toBe("120px");
  });

  it("an explicit destroyDebugCssOverflow() on after-swap keeps the widget down", () => {
    // The /astro/ playground calls destroyDebugCssOverflow() on after-swap.
    // The module-level destroy is the strongest "off" signal — unlike the
    // implicit swap teardown (host discarded, options remembered), an
    // explicit destroy forgets the options, so the library's page-load
    // revival stays quiet. The widget only comes back when the APP calls
    // initDebugCssOverflow() again (e.g. with a fresh dynamic offset).
    onAfterSwap(() => destroyDebugCssOverflow());
    initDebugCssOverflow({ storagePrefix: "test:", offset: { top: 64 } });

    document.dispatchEvent(new Event("astro:after-swap"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(0);

    // No app re-init on page-load: the explicit destroy is honored.
    document.dispatchEvent(new Event("astro:page-load"));
    expect(document.querySelectorAll("#dcso-host").length).toBe(0);
  });
});

describe("session-disable is respected across navigations", () => {
  it("a directly destroyed controller is not resurrected by astro:page-load", () => {
    const controller = initDebugCssOverflow({ storagePrefix: "test:" });
    controller!.destroy(); // e.g. the widget's "disable for this session"

    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));

    expect(document.querySelectorAll("#dcso-host").length).toBe(0);
    expect(controller!.destroyed).toBe(true);
  });

  it("destroyDebugCssOverflow() keeps the widget down across navigations", () => {
    initDebugCssOverflow({ storagePrefix: "test:" });
    destroyDebugCssOverflow();

    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));

    expect(document.querySelectorAll("#dcso-host").length).toBe(0);
  });

  it("enabled: false is never revived", () => {
    expect(initDebugCssOverflow({ enabled: false })).toBeNull();

    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));

    expect(document.querySelectorAll("#dcso-host").length).toBe(0);
  });
});
