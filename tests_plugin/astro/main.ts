/**
 * /astro/ — lightweight, pure client-side emulation of Astro View Transitions.
 *
 * This route does NOT use the `astro` package: Astro is a standalone
 * meta-framework and cannot be layered into this standard multi-page Vite dev
 * server alongside the other routes. Instead, the route emulates the part of
 * the Astro ClientRouter (view-transitions router) lifecycle that matters for
 * the detector:
 *
 *   swap → astro:after-swap → astro:page-load
 *
 * The toolbar's "Simulate" buttons dispatch the same native DOM events on
 * `document`, with the swap step removing and re-adding the page markup
 * exactly like a ClientRouter swap (which replaces the document content and
 * thereby discards any element the detector had mounted inside <body>,
 * including the widget host). The integration pattern under test:
 *
 *   * astro:after-swap — the widget host lived inside the swapped-out
 *     content, so the previous detector instance is torn down via
 *     destroyDebugCssOverflow() (idempotent — safe to fire twice).
 *   * astro:page-load  — a fresh detector is created for the "new" page via
 *     initDebugCssOverflow(). The library keeps a single active instance
 *     (re-init replaces the previous one), so no duplicates accumulate even
 *     when the event fires several times in a row.
 *
 * Feedback model (all inside the toolbar — the page content itself stays
 * crisp at 100% opacity through every simulated event):
 *   * the button whose simulation state is currently in effect carries
 *     .is-active ("Simulate Navigation" flashes, then settles on
 *     "Simulate Page Load" because the full navigation sequence ends with
 *     a fresh page-load);
 *   * metric values pulse (150ms) on every change;
 *   * the render badge increments on every astro:page-load.
 *
 * The toolbar sits ABOVE the swapped region: emulateSwap() keeps it mounted
 * (it only re-attaches the trigger listeners), so controls stay clickable
 * across simulated navigations and the metrics update in place without any
 * layout shift.
 */
import {
  destroyDebugCssOverflow,
  initDebugCssOverflow,
} from "debug-css-overflow";
import {
  computeWidgetOffset as sharedComputeWidgetOffset,
  initPlayground,
  isLayoutBroken,
  syncNavbarHeight,
  WIDGET_GUTTER,
} from "../shared/playground";
import "../shared/playground.css";
import "../shared/overflow-cases.css";
import "./route.css";

/**
 * Viewport-top offset for the floating widget, computed from the real
 * geometry so the badge always sits clearly below BOTH the (possibly
 * wrapped) fixed navbar and the Astro toolbar's action buttons (which can
 * wrap to a second row on narrow viewports) plus the default 12px corner
 * gutter. Route-scoped: other routes keep the shared WIDGET_OFFSET.
 */

let headerObserver: ResizeObserver | null = null;

// Mount the shared playground (fixed navbar + overflow edge cases) and start
// in the broken state, exactly like every other route. The page header in
// index.html sits below the toolbar and above these cases.
initPlayground("astro");
// syncNavbarHeight keeps body padding + a navbar-only widget offset in sync;
// followHeaderChanges then layers the toolbar on top of the widget offset.
syncNavbarHeight();
followHeaderChanges();

function computeWidgetOffset(): { top: number } {
  // The fixed navbar — its height is dynamic when tabs wrap on resize.
  const base = sharedComputeWidgetOffset().top;
  const toolbar = document.querySelector<HTMLElement>(".astro-toolbar");
  if (!toolbar) return { top: base };
  // The toolbar bottom is measured in viewport coordinates (computed at
  // boot, scroll = 0), so it already includes the navbar's space: the widget
  // must clear the navbar AND the toolbar's own (wrappable) height.
  const toolbarBottom = Math.ceil(toolbar.getBoundingClientRect().bottom);
  return { top: Math.max(base, toolbarBottom + WIDGET_GUTTER) };
}

/** Follows navbar/toolbar re-wrapping with the widget offset (in place). */
function followHeaderChanges(): void {
  const nav = document.getElementById("dcso-nav");
  const toolbar = document.querySelector<HTMLElement>(".astro-toolbar");
  const targets = [nav, toolbar].filter((el): el is HTMLElement => el !== null);
  if (targets.length === 0) return;

  const apply = (): void => {
    window.__dcso?.setOffset(computeWidgetOffset());
  };
  if (headerObserver) headerObserver.disconnect();
  headerObserver = new ResizeObserver(apply);
  for (const el of targets) headerObserver.observe(el);
}

/** Creates a fresh detector below the toolbar and exposes it as window.__dcso. */
function boot(): void {
  window.__dcso = initDebugCssOverflow({
    position: "top-right",
    offset: computeWidgetOffset(),
  }) ?? undefined;
}

/* --------------------------------------------------------------------------
 * Active button state — marks the simulation state currently in effect
 * ------------------------------------------------------------------------ */

/** Moves .is-active to the given trigger button (exclusively). */
function setActiveButton(id: string): void {
  for (const btn of document.querySelectorAll<HTMLElement>(".astro-actions .btn")) {
    btn.classList.toggle("is-active", btn.id === id);
  }
}

/**
 * (Re-)attaches the toolbar trigger listeners. Idempotent — safe to call on
 * the static markup and again after any DOM surgery. The toolbar never leaves
 * the document during emulateSwap(), so the listeners stay bound once; this
 * only re-binds if a future variant actually replaces the toolbar node.
 *
 * Active-state workflow:
 *   * Simulate After Swap → after-swap state holds (.is-active stays).
 *   * Simulate Page Load  → .is-active switches to the page-load button.
 *   * Simulate Navigation → flashes on the navigation button, runs the full
 *     swap → after-swap → page-load sequence, and settles on the page-load
 *     button (the sequence ends in a fresh page-load).
 */
function mountToolbar(): void {
  const navigation = document.getElementById("astro-simulate-navigation");
  const afterSwap = document.getElementById("astro-simulate-after-swap");
  const pageLoad = document.getElementById("astro-simulate-page-load");

  if (navigation && !navigation.dataset.bound) {
    navigation.dataset.bound = "true";
    navigation.addEventListener("click", () => {
      // Flash the navigation button for the duration of the sequence.
      setActiveButton("astro-simulate-navigation");
      // The real ClientRouter order: swap DOM → after-swap → page-load.
      emulateSwap();
      document.dispatchEvent(new Event("astro:after-swap"));
      document.dispatchEvent(new Event("astro:page-load"));
      // The sequence ends in a fresh page-load: settle there.
      setActiveButton("astro-simulate-page-load");
    });
  }
  if (afterSwap && !afterSwap.dataset.bound) {
    afterSwap.dataset.bound = "true";
    afterSwap.addEventListener("click", () => {
      setActiveButton("astro-simulate-after-swap");
      emulateSwap();
      document.dispatchEvent(new Event("astro:after-swap"));
    });
  }
  if (pageLoad && !pageLoad.dataset.bound) {
    pageLoad.dataset.bound = "true";
    pageLoad.addEventListener("click", () => {
      setActiveButton("astro-simulate-page-load");
      document.dispatchEvent(new Event("astro:page-load"));
    });
  }
}

/**
 * Emulates the ClientRouter swap: the current page markup (navbar + overflow
 * cases) is replaced with a fresh copy of the same geometry. Like a real
 * swap — which replaces the document content — this discards every element
 * mounted inside <body> below the toolbar, including the detector's widget
 * host, while <head> styles survive the merge. The DevTools toolbar and the
 * page header (with the render badge) are kept mounted — real Astro
 * persists islands across swaps too — so the controls, live metrics, and
 * the fresh-render indicator survive navigation. The overflow triggers keep
 * their broken/clean state so the "new" page reports the same offenders as
 * the "old" one. The swapped content itself is never dimmed or blurred —
 * it stays crisp at 100% opacity.
 */
function emulateSwap(): void {
  const broken = isLayoutBroken();

  document.getElementById("dcso-nav")?.remove();
  document.getElementById("playground-cases")?.remove();
  document.getElementById("dcso-host")?.remove();

  initPlayground("astro");
  document.body.classList.toggle("layout-broken", broken);
  // The fresh navbar must re-sync body padding / the ResizeObserver, and the
  // header follower must track the re-mounted navbar again.
  syncNavbarHeight();
  followHeaderChanges();
  mountToolbar();
}

/* --------------------------------------------------------------------------
 * Render badge — fresh DOM mount indicator (Render #n)
 * ------------------------------------------------------------------------ */

let renderCount = 0;

/** Shows/bumps the "Render #n" badge with a small entrance transition. */
function bumpRenderBadge(): void {
  renderCount += 1;
  const badge = document.getElementById("astro-render-badge");
  if (!badge) return;
  badge.textContent = `Render #${renderCount}`;
  badge.hidden = false;
  // Retrigger the entrance transition on every remount.
  badge.classList.remove("is-visible");
  void badge.offsetWidth; // flush: restart the CSS transition
  badge.classList.add("is-visible");
}

/* --------------------------------------------------------------------------
 * astro:after-swap — teardown
 * ------------------------------------------------------------------------ */

document.addEventListener("astro:after-swap", () => {
  markEvent("astro:after-swap");
  // The swap discarded the widget host: tear down the stale instance so no
  // observers, listeners, or detached nodes leak. Idempotent — dispatching
  // the event twice is harmless.
  destroyDebugCssOverflow();
  window.__dcso = undefined;
  updateDiagnostics();
});

/* --------------------------------------------------------------------------
 * astro:page-load — (re-)init
 * ------------------------------------------------------------------------ */

document.addEventListener("astro:page-load", () => {
  markEvent("astro:page-load");
  // A fresh detector for the "new" page. initDebugCssOverflow replaces any
  // previous instance, so this cannot create duplicates even when the event
  // fires multiple times without an intervening swap.
  boot();
  bumpRenderBadge();
  updateDiagnostics();
});

/* --------------------------------------------------------------------------
 * Live metrics readout — proves the invariants hold at every step
 * -------------------------------------------------------------------------- */

function updateDiagnostics(): void {
  const hosts = document.querySelectorAll("#dcso-host").length;
  const styles = document.querySelectorAll("#dcso-page-styles").length;

  pulseOnChange("astro-diag-hosts", String(hosts));
  pulseOnChange("astro-diag-styles", String(styles));

  const state = window.__dcso?.state;
  const overflowEl = document.getElementById("astro-diag-overflow");
  const hasOverflow = state ? state.pageOverflow : null;
  pulseOnChange(
    "astro-diag-overflow",
    hasOverflow === null ? "—" : hasOverflow ? "YES" : "NO",
  );
  if (overflowEl) overflowEl.dataset.ok = String(hasOverflow === true);
}

function markEvent(name: string): void {
  setText("astro-diag-last-event", name);
  pulseMetric("astro-diag-last-event");
  console.info(`[astro-emulation] ${name} received`);
}

/**
 * Updates a metric and pulses it only when the value actually changed, so
 * users see the numbers flip instantly without strobing on every event.
 */
function pulseOnChange(id: string, text: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.textContent === text) return;
  el.textContent = text;
  pulseMetric(id);
}

/** Retriggers the 150ms pulse animation on a toolbar metric. */
function pulseMetric(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("is-pulsing");
  void el.offsetWidth; // flush: restart the CSS animation
  el.classList.add("is-pulsing");
  el.addEventListener("animationend", () => el.classList.remove("is-pulsing"), {
    once: true,
  });
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

/* --------------------------------------------------------------------------
 * Boot — the initial load is itself the first astro:page-load
 * ------------------------------------------------------------------------ */

mountToolbar();
boot();
bumpRenderBadge();
updateDiagnostics();
