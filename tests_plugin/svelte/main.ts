/**
 * /svelte/ — Svelte 5 component with scoped styles (see App.svelte).
 */
import { mount } from "svelte";
import App from "./App.svelte";
import "../shared/playground.css";

mount(App, { target: document.getElementById("app")! });
