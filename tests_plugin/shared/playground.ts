/**
 * Shared playground helpers: the fixed top navbar (route links + overflow
 * trigger controls) and the standard set of intentional layout overflow edge
 * cases. Every route mounts these so the screenshot suite sees the same
 * geometry across stacks.
 */

import type { DebugCssOverflowController } from "debug-css-overflow";

declare global {
  interface Window {
    /**
     * Live detector controller, exposed for the screenshot suite and for
     * manual DevTools experiments (e.g. `__dcso.toggleHighlight()`).
     */
    __dcso?: DebugCssOverflowController;
  }
}

/**
 * Corner gutter kept between the (possibly multi-line) navbar and the widget.
 */
export const WIDGET_GUTTER = 12;

/**
 * Default widget offset used before the navbar has rendered geometry.
 * Mirrors the single-line navbar height (52px) + the 12px gutter.
 */
export const WIDGET_OFFSET = { top: 64 } as const;

/**
 * Widget offset computed from the navbar's ACTUAL rendered height
 * (`getBoundingClientRect().height`), so the widget positions cleanly below
 * the bar regardless of how many lines the tabs break into on resize.
 * Reads the live height (never the `--dcso-nav-h` constant) because the
 * bar is `flex-wrap: wrap` and grows downward when tabs wrap.
 */
export function computeWidgetOffset(): { top: number } {
  const nav = document.getElementById("dcso-nav");
  if (!nav) return { ...WIDGET_OFFSET };
  const height = nav.getBoundingClientRect().height;
  if (!Number.isFinite(height) || height <= 0) return { ...WIDGET_OFFSET };
  return { top: Math.ceil(height) + WIDGET_GUTTER };
}

/**
 * Keeps `document.body` padding AND the live widget offset in sync with the
 * rendered navbar height while tabs wrap on resize. The widget repositioning
 * uses the controller's setOffset(), so the follow happens in place — no
 * re-init. Safe to call again after the navbar is re-mounted (e.g. the Astro
 * swap emulation): the previous observer is disconnected first, so exactly
 * one live observer tracks the current `#dcso-nav` element.
 */
let navResizeObserver: ResizeObserver | null = null;

export function syncNavbarHeight(): void {
  const nav = document.getElementById("dcso-nav");
  if (!nav) return;

  const apply = (): void => {
    const height = nav.getBoundingClientRect().height;
    if (height > 0) {
      document.body.style.paddingTop = `${Math.ceil(height)}px`;
    }
    // Follow the (possibly wrapped) bar with the widget, in place.
    window.__dcso?.setOffset(computeWidgetOffset());
  };

  apply();
  if (typeof ResizeObserver === "undefined") return;
  navResizeObserver?.disconnect();
  navResizeObserver = new ResizeObserver(apply);
  navResizeObserver.observe(nav);
}

/**
 * Framework brand icons (crisp, monochrome-friendly SVG paths) shown on the
 * nav tabs at <= 640px, where the full text labels no longer fit. Labels
 * remain the accessible name: every link keeps title/aria-label with the
 * full framework name, and the icon is aria-hidden.
 */
const ROUTE_ICONS: Record<string, string> = {
  // Vanilla: HTML5 shield glyph
  vanilla: `<svg class="dcso-nav__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M1.5 1.5h13L13 13.5 8 15l-5-1.5L1.5 1.5Zm2.6 2.6.2 2h7.4l-.2 2.3H6.6l.15 1.8L10 10.4l2.6-.8.3 3-4.9 1.4-4.9-1.4-.5-5.6h2.5l.2 2.3h4.9l-.15-1.6H4.4l-.3-3.7Z" fill="currentColor"/>
  </svg>`,
  // Nunjucks: curly braces (templating)
  nunjucks: `<svg class="dcso-nav__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M6.1 2.3C4.6 2.6 3.9 3.5 3.9 5.2c0 1.5-.4 2.1-1.4 2.4v1c1 .3 1.4.9 1.4 2.4 0 1.7.7 2.6 2.2 2.9l.5-1.2c-.9-.2-1.2-.7-1.2-2 0-1.5-.5-2.4-1.5-2.8 1-.4 1.5-1.3 1.5-2.8 0-1.3.3-1.8 1.2-2l-.5-1.2Zm3.8 0 .5 1.2c.9.2 1.2.7 1.2 2 0 1.5.5 2.4 1.5 2.8-1 .4-1.5 1.3-1.5 2.8 0 1.3-.3 1.8-1.2 2l.5 1.2c1.5-.3 2.2-1.2 2.2-2.9 0-1.5.4-2.1 1.4-2.4v-1c-1-.3-1.4-.9-1.4-2.4 0-1.7-.7-2.6-2.2-2.9Z" fill="currentColor"/>
  </svg>`,
  // Svelte: stylized S
  svelte: `<svg class="dcso-nav__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M12.9 2.2c-1.3-1.9-4-2.4-5.9-1.1L4.2 2.9C3.1 3.6 2.4 4.8 2.2 6.1c-.2 1 .05 2 .6 2.85-.55.75-.9 1.65-1 2.6-.1 1.3.3 2.6 1.2 3.55 1.3 1.9 4 2.4 5.9 1.1l2.8-1.8c1.1-.7 1.8-1.9 2-3.2.2-1-.05-2-.6-2.85.55-.75.9-1.65 1-2.6.1-1.3-.3-2.6-1.2-3.55ZM7.1 12.35c-.9.25-1.9-.1-2.4-.9-.35-.5-.5-1.1-.4-1.7.03-.2.1-.4.18-.58l.14-.27.24.17c.55.4 1.05.64 1.6.74l.12.13c.4.55 1.1.78 1.7.5l2.8-1.8c.3-.2.5-.5.55-.85.05-.38-.05-.75-.28-1.05-.4-.55-1.1-.78-1.7-.5l-1.07.68c-.9.25-1.9-.1-2.4-.9l-.02-.03c-.35-.5-.5-1.1-.4-1.7.03-.2.1-.4.18-.58.18-.36.46-.67.82-.9l2.8-1.8c.3-.2.65-.28 1-.23.38.05.73.24.96.53.4.55 1.1.78 1.7.5.6-.28.86-1 .5-1.55l-.1-.14c-.6-.87-1.55-1.46-2.6-1.6h-.05c-1.05-.13-2.1.13-2.95.72l-2.8 1.8c-.6.4-1.07.97-1.35 1.63l-.08.2c-.28.72-.34 1.5-.17 2.24.14.6.44 1.15.87 1.6-.44.5-.73 1.1-.85 1.75-.17.85-.05 1.73.35 2.5l.06.12c.36.7.94 1.27 1.65 1.62.75.37 1.6.44 2.4.2l-.13-.9Z" fill="currentColor"/>
  </svg>`,
  // Vue: nested V
  vue: `<svg class="dcso-nav__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M1 2.5h3L8 9l4-6.5h3L8 14 1 2.5Zm4.7 0h4.6L8 6.6 5.7 2.5Z" fill="currentColor"/>
  </svg>`,
  // React: atom orbits (approximated with circles + ellipses)
  react: `<svg class="dcso-nav__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="1.4" fill="currentColor"/>
    <g fill="none" stroke="currentColor" stroke-width="1.1">
      <ellipse cx="8" cy="8" rx="7" ry="2.9"/>
      <ellipse cx="8" cy="8" rx="7" ry="2.9" transform="rotate(60 8 8)"/>
      <ellipse cx="8" cy="8" rx="7" ry="2.9" transform="rotate(120 8 8)"/>
    </g>
  </svg>`,
  // Astro: rocket with trail
  astro: `<svg class="dcso-nav__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M11.4 1.3c1.4-.4 2.9-.3 3.3 1.4.3 1.2-.1 2.6-.8 4-.7 1.3-1.7 2.6-2.7 3.6-.4 2-1.5 3.6-3 4.7-.5.4-1.1.6-1.7.8.3-.9.5-1.8.5-2.7 0-1-.3-1.9-.9-2.6-.6.7-1.4 1.2-2.3 1.5.6-.8.9-1.7.9-2.6 0-1.2-.5-2.3-1.3-3.1-.6 1.5-1.6 2.8-2.9 3.7.3-1 .4-2 .3-2.9C.3 6 .3 4.9.6 3.9 1 2.4 2.4 1.7 3.8 1.7c1.6 0 3 .7 4.3 1.6.9.6 1.8 1.4 2.5 2.3.2-.1.5-.2.8-.3Z" fill="currentColor"/>
  </svg>`,
};

/** Route table rendered by the fixed top navbar. */
export const ROUTES = [
  { path: "/vanilla/", label: "Vanilla" },
  { path: "/nunjucks/", label: "Nunjucks + HTMX" },
  { path: "/svelte/", label: "Svelte" },
  { path: "/vue/", label: "Vue" },
  { path: "/react/", label: "React" },
  { path: "/astro/", label: "Astro" },
] as const;

/** Marks the page as "broken": every overflow edge case becomes visible. */
export function breakLayout(): void {
  document.body.classList.add("layout-broken");
}

/** Toggles the broken layout state; returns the new state. */
export function toggleLayout(): boolean {
  document.body.classList.toggle("layout-broken");
  return document.body.classList.contains("layout-broken");
}

/** True while the overflow triggers are active. */
export function isLayoutBroken(): boolean {
  return document.body.classList.contains("layout-broken");
}

/** Idempotent: builds the fixed top navbar (links + overflow controls). */
export function mountNavbar(active: string): void {
  if (document.getElementById("dcso-nav")) return;

  const nav = document.createElement("nav");
  nav.id = "dcso-nav";
  nav.className = "dcso-nav";
  nav.setAttribute("aria-label", "Playground routes");

  const brand = document.createElement("a");
  brand.className = "dcso-nav__brand";
  brand.href = "/vanilla/";
  brand.title = "debug-css-overflow playground";
  brand.setAttribute("aria-label", "debug-css-overflow playground");
  // Label span: hidden on <= 640px so only the ◉ mark remains — the mobile
  // bar must fit brand + 6 icon tabs + the toggle button on one line.
  const brandLabel = document.createElement("span");
  brandLabel.className = "dcso-nav__label";
  brandLabel.textContent = "overflow";
  brand.append(brandLabel);
  nav.append(brand);

  const links = document.createElement("div");
  links.className = "dcso-nav__links";
  for (const route of ROUTES) {
    const key = route.path.replace(/\//g, ""); // "/vanilla/" → "vanilla"
    const a = document.createElement("a");
    a.href = route.path;
    // Accessibility: the link is ALWAYS named by the full framework label,
    // even on narrow viewports where the visible text is swapped for an icon.
    a.title = route.label;
    a.setAttribute("aria-label", route.label);
    if (route.path === `/${active}/`) a.setAttribute("aria-current", "page");

    const iconWrap = document.createElement("span");
    iconWrap.className = "dcso-nav__icon-wrap";
    iconWrap.innerHTML = ROUTE_ICONS[key] ?? "";
    a.append(iconWrap);

    const label = document.createElement("span");
    label.className = "dcso-nav__label";
    label.textContent = route.label;
    a.append(label);

    links.append(a);
  }
  nav.append(links);

  const actions = document.createElement("div");
  actions.className = "dcso-nav__actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.id = "dcso-toggle-overflow";
  toggleBtn.textContent = "Toggle Overflow";
  toggleBtn.title = "Toggle the intentional overflow edge cases";

  actions.append(toggleBtn);
  nav.append(actions);

  toggleBtn.addEventListener("click", () => toggleLayout());

  document.body.prepend(nav);
}

/** Idempotent: appends the standard overflow edge cases to the page. */
export function mountOverflowCases(): void {
  if (document.getElementById("playground-cases")) return;

  const main = document.createElement("main");
  main.id = "playground-cases";
  main.className = "playground-cases";

  main.innerHTML = `
    <section class="case case-viewport-wide">
      <h2>Viewport-wide block</h2>
      <p>While the layout is broken this section is forced to <code>width: 120vw</code> — wider than the viewport.</p>
    </section>

    <section class="case case-table">
      <h2>Un-scrolled wide table</h2>
      <p>A table with <code>min-width: 1800px</code> and no scroll wrapper.</p>
      <table>
        <thead>
          <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>SKU</th><th>Warehouse</th><th>Weight</th><th>Origin</th></tr>
        </thead>
        <tbody>
          <tr><td>Ergonomic keyboard</td><td>Input</td><td>$129</td><td>42</td><td>KB-001</td><td>Berlin</td><td>980g</td><td>DE</td></tr>
          <tr><td>4K webcam</td><td>Video</td><td>$89</td><td>17</td><td>WC-204</td><td>Prague</td><td>310g</td><td>CZ</td></tr>
          <tr><td>Studio microphone</td><td>Audio</td><td>$249</td><td>8</td><td>MC-077</td><td>Amsterdam</td><td>1.2kg</td><td>NL</td></tr>
        </tbody>
      </table>
    </section>

    <section class="case case-nowrap">
      <h2>Nowrap text</h2>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
    </section>

    <section class="case case-offset">
      <h2>Off-viewport offset</h2>
      <p>While broken this section is shifted with <code>position: relative; left: 110%</code> so its right edge leaves the viewport.</p>
    </section>
  `;

  document.body.appendChild(main);
}

/**
 * Mounts the navbar + overflow cases and starts in the broken (overflowing)
 * state. Framework routes that render their own case markup pass
 * `withCases: false`.
 */
export function initPlayground(
  active: string,
  { withCases = true }: { withCases?: boolean } = {},
): void {
  mountNavbar(active);
  if (withCases) mountOverflowCases();
  breakLayout();
}
