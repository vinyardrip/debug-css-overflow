/**
 * Automated screenshot suite for the tests_plugin MPA playground.
 *
 * Run with:  pnpm test:screenshot   (alias: pnpm capture)
 *
 * Pipeline:
 *   1. Ensure deps are installed and the library is built (dist/index.mjs).
 *   2. Start the Vite dev server (tests_plugin) on http://localhost:5173.
 *   3. Launch Playwright (headless Chromium). Browser resolution is graceful
 *      — first hit wins, nothing is downloaded at runtime:
 *        a. Playwright-managed Chromium (npx playwright install chromium)
 *        b. system Chrome/Chromium (auto-discovered or CHROME_PATH/
 *           CHROMIUM_PATH/PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
 *   4. For every route capture four states at 1440x900:
 *        demo-danger     — overflow triggers ON, widget reports offenders
 *        demo-highlight  — container-outline highlighting enabled (Alt+O)
 *        demo-minimized  — widget collapsed to a dot with the metrics badge
 *        demo-clean      — all triggers removed, widget reports OK
 *      plus a mobile 375x812 pass of the danger state per route.
 *
 * Output:
 *   .github/assets/<route>/demo-{danger,highlight,minimized,clean}.png
 *   .github/assets/demo-{danger,highlight,minimized,clean}.png  (vanilla, canonical)
 *   .github/assets/mobile/<route>-danger.png                    (mobile overflow check)
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = path.join(ROOT, "tests_plugin");
const VITE_BIN = path.join(PLUGIN_DIR, "node_modules", "vite", "bin", "vite.js");
const DIST_MJS = path.join(ROOT, "dist", "index.mjs");
const ASSETS_DIR = path.join(ROOT, ".github", "assets");

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

const ROUTES = ["vanilla", "nunjucks", "svelte", "vue", "react", "astro"] as const;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------------------
 * Browser resolution (graceful — never throws before every option is tried)
 * ------------------------------------------------------------------------ */

/**
 * Launches headless Chromium, trying every source in order:
 *
 *   1. Playwright-managed Chromium (npx playwright install chromium) — the
 *      default, version-matched browser. Not downloaded here: the launch
 *      fails fast only when it is missing AND no system browser exists.
 *   2. Explicit override via $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH /
 *      $CHROME_PATH / $CHROMIUM_PATH.
 *   3. Auto-discovered system Chrome/Chromium from common install locations.
 *
 * Returns the launched browser plus a human-readable source description.
 */
async function launchBrowser(): Promise<{ browser: Browser; source: string }> {
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ];

  // 1. Playwright-managed Chromium (its own cache; missing registry entries
  //    throw, which we catch so the system fallbacks get their turn).
  try {
    const browser = await chromium.launch({ headless: true, args: launchArgs });
    return { browser, source: "Playwright-managed Chromium" };
  } catch {
    console.log("[screenshots] Playwright-managed Chromium unavailable — falling back to system browsers...");
  }

  // 2. Env override (explicit binary path).
  // 3. Auto-discovery over common system locations.
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const executablePath of candidates) {
    if (!existsSync(executablePath)) continue;
    try {
      const browser = await chromium.launch({
        headless: true,
        executablePath,
        args: launchArgs,
      });
      return { browser, source: `system Chromium at ${executablePath}` };
    } catch (error) {
      console.warn(
        `[screenshots] Failed to launch ${executablePath}: ${
          error instanceof Error ? error.message.split("\n")[0] : error
        }`,
      );
    }
  }

  throw new Error(
    "No usable Chromium found. Either install the Playwright-managed browser:\n" +
      "  npx playwright install chromium\n" +
      "or point the suite at a system browser, e.g.:\n" +
      "  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable pnpm test:screenshot\n" +
      "(also honored: CHROME_PATH, CHROMIUM_PATH)",
  );
}

/* --------------------------------------------------------------------------
 * Dev server management
 * ------------------------------------------------------------------------ */

function ensureDependenciesInstalled(): void {
  if (existsSync(VITE_BIN)) return;
  console.log("[screenshots] tests_plugin dependencies missing — running pnpm install...");
  const result = spawnSync("pnpm", ["install"], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error("pnpm install failed.");
}

function ensureLibraryBuilt(): void {
  if (existsSync(DIST_MJS)) return;
  console.log("[screenshots] dist/ missing — building the library...");
  const result = spawnSync("pnpm", ["build"], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Library build failed (pnpm build).");
}

/**
 * Fails fast when something else already listens on the capture port.
 * Without this, waitForServer would happily fetch a STALE leftover server
 * (e.g. from a crashed run) and capture screenshots against outdated code.
 */
async function ensurePortFree(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/`);
    if (response.ok || response.status < 500) {
      throw new Error(
        `Port ${PORT} is already in use (HTTP ${response.status}) — a leftover Vite server is probably running. Kill it first:\n` +
          `  pkill -f "vite.*--port ${PORT}"\n` +
          `or rerun on a free port: PORT=${PORT + 1} is not supported; stop the old process instead.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && /already in use/.test(error.message)) throw error;
    // Network error (ECONNREFUSED) → the port is free. Proceed.
  }
}

/**
 * Kills the dev server reliably. Vite spawns child workers, so a plain
 * `server.kill()` can leave orphaned node/vite processes holding the port.
 * The server runs in its own process group (see startDevServer), so a group
 * signal (negative pid) takes down the whole tree.
 */
function killServer(server: ChildProcess): void {
  if (server.exitCode !== null || server.signalCode !== null) return; // already dead
  intentionalKill = true; // suppress the "server exited" report below
  try {
    process.kill(-server.pid!, "SIGTERM"); // signal the whole process group
  } catch {
    try {
      server.kill("SIGTERM"); // group kill failed — fall back to direct kill
    } catch { /* already gone */ }
  }
}

/** True once WE killed the server (so exit code 143 is expected, not an error). */
let intentionalKill = false;

/**
 * Registers unconditional cleanup so no Vite process survives the script:
 * normal exit, unhandled errors, and Ctrl+C / SIGTERM all terminate the
 * spawned server tree before the process goes away.
 */
function registerServerCleanup(server: ChildProcess): void {
  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    killServer(server);
  };
  process.on("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      cleanup();
      // Exit with the conventional code after cleaning up our child.
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

function startDevServer(): { server: ChildProcess; logs: () => string } {
  console.log(`[screenshots] Starting Vite dev server (tests_plugin) on :${PORT}...`);
  const chunks: Buffer[] = [];
  const server = spawn(
    process.execPath,
    [VITE_BIN, "--port", String(PORT), "--strictPort"],
    {
      cwd: PLUGIN_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      // detached: true → the server gets its OWN process group (its pid is
      // the group id), so killServer can signal vite AND all of its worker
      // children at once. Without this, vite's esbuild/rollup children
      // survive a direct kill of the parent pid and keep holding the port.
      detached: true,
    },
  );
  server.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  server.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
  // If the server dies on its own (e.g. the port was already taken), surface
  // its logs — otherwise the waitForServer timeout is the only hint. An
  // exit after OUR killServer (code 143, the SIGTERM we sent) is expected.
  server.on("exit", (code) => {
    if (intentionalKill) return;
    if (code !== null && code !== 0) {
      console.error(
        `[screenshots] Vite dev server exited (code ${code}). Logs:\n${Buffer.concat(chunks).toString("utf8")}`,
      );
    }
  });
  registerServerCleanup(server);
  return {
    server,
    logs: () => Buffer.concat(chunks).toString("utf8"),
  };
}

async function waitForServer(
  server: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error("Vite dev server exited before becoming ready.");
    }
    try {
      const response = await fetch(`${BASE_URL}/vanilla/`);
      if (response.ok) return;
    } catch {
      // not up yet — keep polling
    }
    await sleep(250);
  }
  throw new Error(
    `Vite dev server did not become ready at ${BASE_URL} within ${timeoutMs}ms`,
  );
}

/* --------------------------------------------------------------------------
 * Capture helpers
 * -------------------------------------------------------------------------- */

/**
 * Disables CSS animations/transitions in the document AND the widget shadow
 * tree so every frame is deterministic (no mid-pulse dot, no fades).
 */
async function freezeAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      "*, *::before, *::after { animation: none !important; transition: none !important; }";
    document.head.appendChild(style);
    const host = document.getElementById("dcso-host");
    host?.shadowRoot?.appendChild(style.cloneNode(true));
  });
}

/** Waits for the detector widget and lets the initial scan settle. */
async function openRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}/${route}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#dcso-host", { timeout: 15000 });
  await sleep(400);
  await freezeAnimations(page);
}

const setState = (
  page: Page,
  state: { highlighted?: boolean; minimized?: boolean },
): Promise<void> =>
  page.evaluate(({ highlighted, minimized }) => {
    if (highlighted !== undefined) window.__dcso?.setHighlighted(highlighted);
    if (minimized !== undefined) window.__dcso?.setMinimized(minimized);
  }, state);

/* --------------------------------------------------------------------------
 * Functional verification (DOM assertions complementing the pixels)
 * ------------------------------------------------------------------------ */

/** Throws with a route-tagged message when a condition fails. */
function expectCondition(
  route: string,
  label: string,
  condition: boolean,
  detail = "",
): void {
  if (!condition) {
    throw new Error(
      `[screenshots] ${route}/ — verification failed: ${label}${detail ? ` (${detail})` : ""}`,
    );
  }
}

/**
 * Expanded-tooltip metrics, read from the live shadow DOM while the layout
 * is broken (danger state, desktop). Asserts:
 *   * the offender-count headline ("Offending elements: N") matches the
 *     detector state and N >= 1;
 *   * the width line carries the right-edge position when the top offender
 *     is shifted (relative offsets/transforms);
 *   * the excess math is transparent: rightEdge - innerWidth === excess;
 *   * the minimized badge format "{count} el. · {viewport}px · +{max}px"
 *     matches the same offender count and viewport.
 */
async function verifyExpandedTooltip(page: Page, route: string): Promise<void> {
  const data = await page.evaluate(() => {
    const shadow = document.getElementById("dcso-host")?.shadowRoot ?? null;
    const text = (selector: string): string =>
      shadow?.querySelector(selector)?.textContent?.trim() ?? "";
    const badgeMatch = text(".dcso-badge").match(
      /^(\d+) el\. · (\d+)px · \+(\d+)px$/,
    );
    return {
      state: window.__dcso?.state ?? null,
      innerWidth: window.innerWidth,
      countText: text(".dcso-tooltip-off-count"),
      widthText: text(".dcso-tooltip-off-width"),
      excessText: text(".dcso-tooltip-off-excess"),
      offenderHidden:
        shadow
          ?.querySelector(".dcso-tooltip-offender")
          ?.classList.contains("dcso-hidden") ?? true,
      badgeText: text(".dcso-badge"),
      badgeMatch: badgeMatch ? badgeMatch.slice(1).map(Number) : null,
    };
  });

  expectCondition(
    route,
    "detector reports overflow in the danger state",
    data.state?.overflowing === true,
    `state=${JSON.stringify(data.state)}`,
  );

  const count = data.state?.offenderCount ?? 0;
  expectCondition(
    route,
    "offender-count headline matches the state",
    data.countText === `Offending elements: ${count}` && count >= 1,
    `countText="${data.countText}", offenderCount=${count}`,
  );
  expectCondition(
    route,
    "offender block is visible in the tooltip",
    data.offenderHidden === false,
  );

  const widthMatch = data.widthText.match(
    /^— Element width: (\d+)px(?: \(right edge: (\d+)px\))?$/,
  );
  expectCondition(
    route,
    "width line is well-formed",
    widthMatch !== null,
    `widthText="${data.widthText}"`,
  );
  const width = Number(widthMatch![1]);
  const rightEdge = widthMatch![2] ? Number(widthMatch![2]) : null;

  const excessMatch = data.excessText.match(
    /^— Overflow beyond viewport: \+(\d+)px$/,
  );
  expectCondition(
    route,
    "excess line is well-formed",
    excessMatch !== null,
    `excessText="${data.excessText}"`,
  );
  const excess = Number(excessMatch![1]);

  // The playground's shifted case (position: relative; left: 110%) must
  // surface its right edge: width alone would hide where the element ends.
  expectCondition(
    route,
    "shifted top offender shows its right edge",
    rightEdge !== null && rightEdge > width,
    `widthText="${data.widthText}"`,
  );
  // Transparency of the delta math: right edge − viewport = overflow excess.
  expectCondition(
    route,
    "right-edge minus viewport equals the reported excess",
    rightEdge === excess + data.innerWidth,
    `rightEdge=${rightEdge}, innerWidth=${data.innerWidth}, excess=${excess}`,
  );

  expectCondition(
    route,
    "minimized badge matches the '{count} el. · {viewport}px · +{max}px' format",
    data.badgeMatch !== null &&
      data.badgeMatch[0] === count &&
      data.badgeMatch[1] === data.innerWidth &&
      data.badgeMatch[2] >= excess,
    `badgeText="${data.badgeText}"`,
  );

  console.log(
    `[screenshots] ${route}/ — verified tooltip: "${data.countText}", "${data.widthText}", "${data.excessText}", badge "${data.badgeText}"`,
  );
}

/**
 * Parent-deduplication check: the playground's wide table
 * (`min-width: 1800px`) overflows at EVERY level (table > tbody > tr > td),
 * but only the top-most `table` may be flagged — its descendants must never
 * carry highlight/offender classes. Runs in the HIGHLIGHT state, where
 * .dcso-highlighted / .dcso-is-overflowing are actually applied to page
 * elements. Verifies against the live DOM:
 *   * the table itself carries both classes (it IS the root offender);
 *   * no element INSIDE the table carries either class.
 */
async function verifyParentDeduplication(page: Page, route: string): Promise<void> {
  const data = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>(".case-table table");
    if (!table) return { hasTable: false } as const;
    const flaggedInside = table.querySelectorAll(
      ".dcso-is-overflowing, .dcso-highlighted",
    ).length;
    const rect = table.getBoundingClientRect();
    return {
      hasTable: true,
      tableHighlighted: table.classList.contains("dcso-highlighted"),
      tableFlagged: table.classList.contains("dcso-is-overflowing"),
      flaggedInside,
      tableRight: Math.round(rect.right),
      innerWidth: window.innerWidth,
    };
  });

  expectCondition(route, "wide table case is present", data.hasTable === true);
  expectCondition(
    route,
    "the table overflows the viewport in this state",
    (data.tableRight ?? 0) > (data.innerWidth ?? 0),
    `tableRight=${data.tableRight}, innerWidth=${data.innerWidth}`,
  );
  expectCondition(
    route,
    "the top-level table is outlined (dcso-highlighted)",
    data.tableHighlighted === true,
  );
  expectCondition(
    route,
    "the top-level table is flagged as the offender (dcso-is-overflowing)",
    data.tableFlagged === true,
  );
  expectCondition(
    route,
    "no descendant of the table is flagged (parent deduplication)",
    (data.flaggedInside ?? 0) === 0,
    `flaggedInside=${data.flaggedInside}`,
  );

  console.log(
    `[screenshots] ${route}/ — verified parent deduplication (table only, right edge ${data.tableRight}px > ${data.innerWidth ?? "?"}px)`,
  );
}

/**
 * Mobile navbar check (<= 640px): the six framework tabs render as icons
 * (labels hidden), keep their accessible names, and the bar itself fits the
 * viewport. For /astro/ additionally verifies the toolbar card and the
 * helper hint wrap without overflowing the viewport.
 */
async function verifyMobileLayout(page: Page, route: string): Promise<void> {
  const data = await page.evaluate(() => {
    const nav = document.getElementById("dcso-nav");
    const tabs = Array.from(
      nav?.querySelectorAll<HTMLAnchorElement>(".dcso-nav__links a") ?? [],
    );
    const style = getComputedStyle(nav!);
    const toolbar = document.querySelector<HTMLElement>(".astro-toolbar");
    const hint = document.querySelector<HTMLElement>(".astro-lifecycle-hint");
    return {
      viewport: window.innerWidth,
      navWidth: nav?.getBoundingClientRect().width ?? 0,
      navScrollWidth: nav?.scrollWidth ?? 0,
      navGap: style.columnGap,
      iconCount: nav?.querySelectorAll(".dcso-nav__icon-wrap").length ?? 0,
      iconsVisible: tabs.every((tab) => {
        const icon = tab.querySelector<HTMLElement>(".dcso-nav__icon-wrap");
        return icon !== null && getComputedStyle(icon).display !== "none";
      }),
      labelsHidden: tabs.every((tab) => {
        const label = tab.querySelector<HTMLElement>(".dcso-nav__label");
        return label === null || getComputedStyle(label).display === "none";
      }),
      namedTabs: tabs.filter((tab) => (tab.title || tab.getAttribute("aria-label")) !== "").length,
      toolbar: toolbar
        ? {
            overflow:
              toolbar.scrollWidth - toolbar.clientWidth,
            wraps:
              (toolbar.querySelector<HTMLElement>(".astro-actions")
                ?.getBoundingClientRect().height ?? 0) > 20,
          }
        : null,
      hintOverflow: hint ? hint.scrollWidth - hint.clientWidth : 0,
    };
  });

  expectCondition(
    route,
    "six icon tabs are rendered",
    data.iconCount === 6,
    `iconCount=${data.iconCount}`,
  );
  expectCondition(route, "icons are visible on mobile", data.iconsVisible);
  expectCondition(route, "text labels are hidden on mobile", data.labelsHidden);
  expectCondition(
    route,
    "every tab keeps its accessible name",
    data.namedTabs === 6,
    `namedTabs=${data.namedTabs}`,
  );
  expectCondition(
    route,
    "the navbar fits the mobile viewport",
    data.navWidth <= data.viewport + 1 && data.navScrollWidth <= data.navWidth + 1,
    `navWidth=${data.navWidth}, scrollWidth=${data.navScrollWidth}, viewport=${data.viewport}`,
  );

  if (route === "astro") {
    expectCondition(
      route,
      "the Astro toolbar card wraps without horizontal overflow",
      (data.toolbar?.overflow ?? 1) <= 1,
      `toolbar scrollWidth-clientWidth=${data.toolbar?.overflow}`,
    );
    expectCondition(
      route,
      "the Astro action buttons render (wrapped) rows",
      data.toolbar?.wraps === true,
    );
    expectCondition(
      route,
      "the helper hint wraps within its card",
      data.hintOverflow <= 1,
      `hint scrollWidth-clientWidth=${data.hintOverflow}`,
    );
  }

  console.log(
    `[screenshots] ${route}/ — verified mobile navbar (icons: ${data.iconCount}, nav ${Math.round(data.navWidth)}px <= ${data.viewport}px)`,
  );
}

async function captureRouteDesktop(
  page: Page,
  route: string,
  outDir: string,
): Promise<void> {
  await openRoute(page, route);

  // 1. Danger — default broken layout, expanded widget, no highlights.
  await setState(page, { highlighted: false, minimized: false });
  await sleep(250);
  // DOM-level metrics verification before the pixel capture (the tooltip
  // renders on hover only, so assert against the live shadow-DOM nodes).
  await verifyExpandedTooltip(page, route);
  await page.screenshot({ path: path.join(outDir, "demo-danger.png") });

  // 2. Highlight — container outlines enabled over the broken layout.
  await setState(page, { highlighted: true });
  await sleep(400);
  // Highlight classes are applied in THIS state: only the top-most offender
  // (the table) may be outlined — never its nested rows/cells.
  await verifyParentDeduplication(page, route);
  await page.screenshot({ path: path.join(outDir, "demo-highlight.png") });

  // 3. Minimized — collapsed dot + metrics badge, highlights off for a clean frame.
  await setState(page, { highlighted: false, minimized: true });
  await sleep(300);
  await page.screenshot({ path: path.join(outDir, "demo-minimized.png") });

  // 4. Clean — click the navbar toggle (the page starts broken, so one click
  //    removes the overflow triggers), then restore the expanded widget.
  //    The widget is offset below the navbar (offset: { top: 64 }), so the
  //    buttons are unobstructed; dispatching the click on the element itself
  //    keeps the step deterministic regardless of pointer/hover state.
  await page.evaluate(() => {
    document.getElementById("dcso-toggle-overflow")?.click();
  });
  await setState(page, { highlighted: false, minimized: false });
  await sleep(600); // MutationObserver debounce (150ms) + rescan
  await page.screenshot({ path: path.join(outDir, "demo-clean.png") });
}

async function captureRouteMobile(
  page: Page,
  route: string,
  outDir: string,
): Promise<void> {
  await openRoute(page, route);
  await setState(page, { highlighted: false, minimized: false });
  await sleep(250);
  // Icon navigation + (for astro) toolbar wrap verification, then pixels.
  await verifyMobileLayout(page, route);
  await page.screenshot({ path: path.join(outDir, `${route}-danger.png`) });
}

/* --------------------------------------------------------------------------
 * Main
 * -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  ensureDependenciesInstalled();
  ensureLibraryBuilt();
  await ensurePortFree();

  const { browser, source } = await launchBrowser();
  console.log(`[screenshots] Using browser: ${source}`);

  const { server, logs } = startDevServer();
  try {
    await waitForServer(server, 30000);
    console.log(`[screenshots] Dev server ready at ${BASE_URL}`);

    const context = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 1,
    });
    // tsx compiles this script with esbuild `keepNames`, which rewrites
    // named inner functions into `__name(fn, "fn")` wrappers. Playwright
    // serializes page.evaluate callbacks to the browser verbatim, where the
    // emitted helper does not exist — a no-op __name shim makes those
    // callbacks runnable. Harmless for every other page script.
    await context.addInitScript(
      "window.__name = window.__name || ((fn) => fn);",
    );

    try {
      // Desktop: all four states, per route.
      for (const route of ROUTES) {
        const outDir = path.join(ASSETS_DIR, route);
        mkdirSync(outDir, { recursive: true });
        const page = await context.newPage();
        await captureRouteDesktop(page, route, outDir);
        await page.close();
        console.log(`[screenshots] ${route}/ — desktop: danger, highlight, minimized, clean`);
      }

      // Canonical copies for the README (vanilla route at desktop).
      for (const state of ["danger", "highlight", "minimized", "clean"]) {
        copyFileSync(
          path.join(ASSETS_DIR, "vanilla", `demo-${state}.png`),
          path.join(ASSETS_DIR, `demo-${state}.png`),
        );
      }
      console.log("[screenshots] Canonical demo-*.png written to .github/assets/");

      // Mobile: danger state per route (375x812 overflow check).
      const mobileContext = await browser.newContext({
        viewport: MOBILE,
        deviceScaleFactor: 1,
      });
      await mobileContext.addInitScript(
        "window.__name = window.__name || ((fn) => fn);",
      );
      const mobileDir = path.join(ASSETS_DIR, "mobile");
      mkdirSync(mobileDir, { recursive: true });
      for (const route of ROUTES) {
        const page = await mobileContext.newPage();
        await captureRouteMobile(page, route, mobileDir);
        await page.close();
        console.log(`[screenshots] ${route}/ — mobile danger captured`);
      }
      await mobileContext.close();
    } finally {
      await browser.close();
    }
  } finally {
    // Group kill (vite + its worker children); the exit/signal handlers in
    // registerServerCleanup are the last-resort safety net.
    killServer(server);
    void logs;
  }

  console.log(`[screenshots] Done. Assets under ${ASSETS_DIR}`);
}

main().catch((error: unknown) => {
  console.error("[screenshots] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
