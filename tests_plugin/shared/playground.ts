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
 * Widget offset used by every route: the fixed navbar (`--dcso-nav-h: 52px`)
 * sits at the top of the viewport, so the top-positioned widget is pushed
 * down to `52 + 12` (52px navbar + the library's default 12px corner gutter)
 * to keep the navbar fully visible and clickable.
 */
export const WIDGET_OFFSET = { top: 64 } as const;

/** Route table rendered by the fixed top navbar. */
export const ROUTES = [
  { path: "/vanilla/", label: "Vanilla" },
  { path: "/nunjucks/", label: "Nunjucks + HTMX" },
  { path: "/svelte/", label: "Svelte" },
  { path: "/vue/", label: "Vue" },
  { path: "/react/", label: "React" },
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
  brand.textContent = "overflow";
  nav.append(brand);

  const links = document.createElement("div");
  links.className = "dcso-nav__links";
  for (const route of ROUTES) {
    const a = document.createElement("a");
    a.href = route.path;
    a.textContent = route.label;
    if (route.path === `/${active}/`) a.setAttribute("aria-current", "page");
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
