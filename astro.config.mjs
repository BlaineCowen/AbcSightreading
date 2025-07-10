import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";

// Server output needed for API routes
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
