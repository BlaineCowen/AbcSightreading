import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import staticAdapter from "@astrojs/adapter-static";

import svelte from "@astrojs/svelte";

export default defineConfig({
  adapter: staticAdapter(),
  output: "static",
  integrations: [svelte(), tailwind()],
});
