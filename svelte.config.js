import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@astrojs/svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
  },
  preprocess: vitePreprocess(),
};

export default config;
