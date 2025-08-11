import { vitePreprocess } from "@astrojs/svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
};

export default config;
