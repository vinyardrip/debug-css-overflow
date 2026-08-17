# debug-css-overflow

Zero-dependency dev utility that detects **horizontal overflow** (`overflow-x`), highlights the offending elements, and shows a small floating widget — fully isolated inside **Shadow DOM**.

- 🎯 Detects whole-page overflow (`scrollWidth > innerWidth`) **and** individual offenders (`offsetWidth` / `getBoundingClientRect().right` beyond the viewport, with a 1px subpixel tolerance).
- 🔦 Hotkey toggles outline highlights on offending elements and layout containers — works even when the auto-status is "OK".
- 📦 Zero runtime dependencies; framework-agnostic; tree-shaken out of production bundles (no DOM access until `initDebugCssOverflow()` is called).
- 🧩 Widget, tooltip, and modal live in a Shadow Root — host CSS cannot leak in, widget CSS cannot leak out.
- 📡 Event-driven scanning: `resize` + `MutationObserver` + `ResizeObserver` (debounced), no `setInterval` polling.
- 🎛️ UI preferences (position, accent color, minimized state, badge visibility) persist in `localStorage`.

## Install

```bash
pnpm add -D debug-css-overflow
```

## Usage

```ts
import { initDebugCssOverflow } from "debug-css-overflow";

// Dev-only, e.g.:
if (import.meta.env.DEV) {
  const detector = initDebugCssOverflow({
    position: "top-right",
    offset: { top: 64 }, // clear a fixed top navbar (52px + 12px gutter)
    accentColor: "#ff0055",
    onChange: (state) => console.log("overflow state:", state),
  });

  // Later:
  // detector.toggleHighlight();
  // detector.setMinimized(true);
  // detector.destroy();
}
```

`initDebugCssOverflow()` returns a controller (or `null` when `enabled: false`), and dispatches a `debug-css-overflow:change` `CustomEvent` on `document` whenever the overflow state changes.

## Options

| Option            | Type                              | Default       | Description                                              |
| ----------------- | --------------------------------- | ------------- | -------------------------------------------------------- |
| `enabled`         | `boolean`                         | `true`        | `false` → nothing is created at all.                     |
| `minimized`       | `boolean`                         | `false`       | Start collapsed into a dot.                              |
| `position`        | `"top-right" \| "top-left" \| "bottom-left" \| "bottom-right"` | `"top-right"` | Widget corner. |
| `offset`          | `{ top?, right?, bottom?, left? }` (px) | `{}` | Displace the widget from the viewport edge, overriding the default 12px gutter for the edges given — e.g. `{ top: 64 }` clears a fixed top navbar. Only edges matching the current position are applied. |
| `accentColor`     | `string`                          | `"#ff0055"`   | Highlight + widget accent color.                         |
| `showMetricsBadge`| `boolean`                         | `true`        | Show the compact metrics badge when minimized.           |
| `hotkeys`         | `{ toggleHighlight?, toggleMinimize? }` | `{ toggleHighlight: "Alt+O", toggleMinimize: "Ctrl+Alt+O" }` | Keyboard shortcuts. |
| `storagePrefix`   | `string`                          | `"dcso:"`     | Prefix for localStorage keys.                            |
| `onChange`        | `(state: OverflowState) => void`  | —             | Called whenever the overflow state changes.              |

## Hotkeys

- **Alt+O** — toggle container outline highlights.
- **Ctrl+Alt+O** — collapse / expand the widget to a dot.

## Development

```bash
pnpm install
pnpm typecheck   # strict TypeScript check
pnpm test        # vitest (unit geometry + E2E widget tests)
pnpm build       # tsup → dist/index.mjs, dist/index.cjs, dist/index.global.js (+ .d.ts)
```

`prepublishOnly` runs `pnpm build && pnpm test` so unbuilt or failing code can never be published.

## Playground & screenshots

`tests_plugin/` is a Vite multi-page playground that showcases and visually tests the widget across five stacks — all mounting the same fixed top navbar and the same intentional overflow edge cases (`width: 120vw`, an un-scrolled wide `<table>`, `white-space: nowrap`, `left: 110%`):

| Route | Stack |
| ----- | ----- |
| `/vanilla/` | Plain HTML + TypeScript |
| `/nunjucks/` | Nunjucks (`vite-plugin-njk-frontmatter`) + HTMX (dynamic DOM insertion) |
| `/svelte/` | Svelte 5 (scoped CSS) |
| `/vue/` | Vue 3 (scoped CSS) |
| `/react/` | React 19 |

```bash
cd tests_plugin && pnpm dev   # http://localhost:5173
```

The navbar's **Toggle Overflow** button flips `body.layout-broken`, which activates or removes every overflow trigger.

`pnpm test:screenshot` (alias `pnpm capture`) drives the whole playground headlessly with Puppeteer: it boots the Vite dev server, visits every route at `1440x900` (plus a `375x812` mobile overflow pass), and captures four states — overflown, highlighted, minimized, and clean — into `.github/assets/`:

| State | Preview |
| ----- | ------- |
| `demo-danger.png` — widget reports offenders (`OVERFLOW`) | ![danger](.github/assets/demo-danger.png) |
| `demo-highlight.png` — container outlines on | ![highlight](.github/assets/demo-highlight.png) |
| `demo-minimized.png` — collapsed dot + metrics badge | ![minimized](.github/assets/demo-minimized.png) |
| `demo-clean.png` — no overflow, status `OK` | ![clean](.github/assets/demo-clean.png) |

Per-route copies live in `.github/assets/<route>/`, and mobile danger shots in `.github/assets/mobile/`.

The suite never downloads a browser binary: it uses `puppeteer-core` and launches the **system** Chrome/Chromium (the root `.npmrc` sets `puppeteer_skip_download=true`). Point it at a specific binary when needed:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable pnpm test:screenshot
# also honored: CHROME_PATH, CHROMIUM_PATH
```

The playground, screenshot scripts, and generated assets are dev-only and excluded from the published package via the `files: ["dist"]` allowlist.

## License

MIT
