import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";

// No adapter needed for basic static site generation
export default defineConfig({
  output: "server",
  integrations: [svelte(), tailwind()],
  vite: {
    resolve: {
      alias: {
        "@": "./src",
      },
    },
    ssr: {
      noExternal: ["abcjs"],
    },
  },
});
