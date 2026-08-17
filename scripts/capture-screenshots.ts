/**
 * Automated screenshot suite for the tests_plugin MPA playground.
 *
 * Run with:  pnpm test:screenshot   (alias: pnpm capture)
 *
 * Pipeline:
 *   1. Ensure deps are installed and the library is built (dist/index.mjs).
 *   2. Start the Vite dev server (tests_plugin) on http://localhost:5173.
 *   3. Launch Puppeteer (puppeteer-core) against the SYSTEM Chrome/Chromium —
 *      no browser binaries are ever downloaded: puppeteer-core has no install
 *      script, and the root .npmrc sets puppeteer_skip_download=true.
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
 *
 * Chromium resolution (first hit wins):
 *   $PUPPETEER_EXECUTABLE_PATH
 *   $CHROME_PATH / $CHROMIUM_PATH
 *   common system locations (/usr/bin/google-chrome*, /usr/bin/chromium*, ...)
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import puppeteer from "puppeteer-core";
import type { Page } from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = path.join(ROOT, "tests_plugin");
const VITE_BIN = path.join(PLUGIN_DIR, "node_modules", "vite", "bin", "vite.js");
const DIST_MJS = path.join(ROOT, "dist", "index.mjs");
const ASSETS_DIR = path.join(ROOT, ".github", "assets");

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

const ROUTES = ["vanilla", "nunjucks", "svelte", "vue", "react"] as const;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

const CHROMIUM_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------------------
 * Chromium discovery
 * ------------------------------------------------------------------------ */

function findExecutable(): string {
  const envCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of [...envCandidates, ...CHROMIUM_CANDIDATES]) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No Chrome/Chromium executable found. Point the suite at a system browser, e.g.:\n" +
      "  PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable pnpm test:screenshot\n" +
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

function startDevServer(): { server: ChildProcess; logs: () => string } {
  console.log(`[screenshots] Starting Vite dev server (tests_plugin) on :${PORT}...`);
  const chunks: Buffer[] = [];
  const server = spawn(
    process.execPath,
    [VITE_BIN, "--port", String(PORT), "--strictPort"],
    { cwd: PLUGIN_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  server.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
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
 * ------------------------------------------------------------------------ */

/** Disables CSS animations/transitions in the document AND the widget shadow
 *  tree so every frame is deterministic (no mid-pulse dot, no fades). */
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

async function captureRouteDesktop(
  page: Page,
  route: string,
  outDir: string,
): Promise<void> {
  await openRoute(page, route);

  // 1. Danger — default broken layout, expanded widget, no highlights.
  await setState(page, { highlighted: false, minimized: false });
  await sleep(250);
  await page.screenshot({ path: path.join(outDir, "demo-danger.png") });

  // 2. Highlight — container outlines enabled over the broken layout.
  await setState(page, { highlighted: true });
  await sleep(400);
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
  await page.screenshot({ path: path.join(outDir, `${route}-danger.png`) });
}

/* --------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  ensureDependenciesInstalled();
  ensureLibraryBuilt();

  const executablePath = findExecutable();
  console.log(`[screenshots] Using browser: ${executablePath}`);

  const { server, logs } = startDevServer();
  let browser: puppeteer.Browser | null = null;
  try {
    await waitForServer(server, 30000);
    console.log(`[screenshots] Dev server ready at ${BASE_URL}`);

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--force-device-scale-factor=1",
      ],
    });

    try {
      // Desktop: all four states, per route.
      for (const route of ROUTES) {
        const outDir = path.join(ASSETS_DIR, route);
        mkdirSync(outDir, { recursive: true });
        const page = await browser.newPage();
        await page.setViewport(DESKTOP);
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
      const mobileDir = path.join(ASSETS_DIR, "mobile");
      mkdirSync(mobileDir, { recursive: true });
      for (const route of ROUTES) {
        const page = await browser.newPage();
        await page.setViewport(MOBILE);
        await captureRouteMobile(page, route, mobileDir);
        await page.close();
        console.log(`[screenshots] ${route}/ — mobile danger captured`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
  }

  console.log(`[screenshots] Done. Assets under ${ASSETS_DIR}`);
}

main().catch((error: unknown) => {
  console.error("[screenshots] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
