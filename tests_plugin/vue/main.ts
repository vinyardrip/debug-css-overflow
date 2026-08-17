/**
 * /vue/ — Vue 3 single-file component with scoped styles (see App.vue).
 */
import { createApp } from "vue";
import App from "./App.vue";
import "../shared/playground.css";

createApp(App).mount("#app");
