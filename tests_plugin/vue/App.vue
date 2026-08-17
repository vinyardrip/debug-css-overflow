<script setup lang="ts">
  import { onMounted } from "vue";
  import { initDebugCssOverflow } from "debug-css-overflow";
  import { breakLayout, mountNavbar, WIDGET_OFFSET } from "../shared/playground";

  onMounted(() => {
    mountNavbar("vue");
    breakLayout();
    window.__dcso = initDebugCssOverflow({ position: "top-right", offset: WIDGET_OFFSET });
  });
</script>

<template>
  <main id="playground-cases" class="playground-cases">
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
  </main>
</template>

<style scoped>
  /* Scoped component styles: Vue adds a data attribute to every selector.
     The <body> gate lives outside the component, so the layout-broken rules
     must be global. NOTE: the whole selector has to be wrapped in :global() —
     the `:global(body.layout-broken) .case-*` prefix form compiles to plain
     `body.layout-broken { ... }` (the trailing scoped part is dropped), which
     would apply every overflow rule to <body> itself. */
  :global(body.layout-broken .case-viewport-wide) {
    width: 120vw;
  }
  :global(body.layout-broken .case-table table) {
    min-width: 1800px;
  }
  :global(body.layout-broken .case-nowrap) {
    white-space: nowrap;
  }
  :global(body.layout-broken .case-offset) {
    position: relative;
    left: 110%;
  }
</style>
