import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

import svelte from "@astrojs/svelte";

export default defineConfig({
  output: "static",
  integrations: [svelte(), tailwind()],
  vite: {
    ssr: {
      noExternal: ["abcjs"],
    },
  },
});
