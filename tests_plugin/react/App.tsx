/**
 * /react/ — React 19 component. The overflow rules live in app.css (a plain
 * stylesheet import) and are gated on body.layout-broken like every other
 * route. StrictMode double-mounts in dev; initPlayground and the detector
 * init are both idempotent, so the second pass just re-creates the widget.
 */
import { useEffect } from "react";
import { initDebugCssOverflow } from "debug-css-overflow";
import { breakLayout, mountNavbar, WIDGET_OFFSET } from "../shared/playground";
import "./app.css";

export default function App() {
  useEffect(() => {
    mountNavbar("react");
    breakLayout();
    window.__dcso = initDebugCssOverflow({ position: "top-right", offset: WIDGET_OFFSET });
  }, []);

  return (
    <main id="playground-cases" className="playground-cases">
      <section className="case case-viewport-wide">
        <h2>Viewport-wide block</h2>
        <p>
          While the layout is broken this section is forced to{" "}
          <code>width: 120vw</code> — wider than the viewport.
        </p>
      </section>

      <section className="case case-table">
        <h2>Un-scrolled wide table</h2>
        <p>
          A table with <code>min-width: 1800px</code> and no scroll wrapper.
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>SKU</th>
              <th>Warehouse</th>
              <th>Weight</th>
              <th>Origin</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ergonomic keyboard</td>
              <td>Input</td>
              <td>$129</td>
              <td>42</td>
              <td>KB-001</td>
              <td>Berlin</td>
              <td>980g</td>
              <td>DE</td>
            </tr>
            <tr>
              <td>4K webcam</td>
              <td>Video</td>
              <td>$89</td>
              <td>17</td>
              <td>WC-204</td>
              <td>Prague</td>
              <td>310g</td>
              <td>CZ</td>
            </tr>
            <tr>
              <td>Studio microphone</td>
              <td>Audio</td>
              <td>$249</td>
              <td>8</td>
              <td>MC-077</td>
              <td>Amsterdam</td>
              <td>1.2kg</td>
              <td>NL</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="case case-nowrap">
        <h2>Nowrap text</h2>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
          ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
          aliquip ex ea commodo consequat. Duis aute irure dolor in
          reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
          pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
          culpa qui officia deserunt mollit anim id est laborum.
        </p>
      </section>

      <section className="case case-offset">
        <h2>Off-viewport offset</h2>
        <p>
          While broken this section is shifted with{" "}
          <code>position: relative; left: 110%</code> so its right edge leaves
          the viewport.
        </p>
      </section>
    </main>
  );
}
