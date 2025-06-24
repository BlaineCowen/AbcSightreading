import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

// No adapter needed for basic static site generation
export default defineConfig({
  output: "server",
  adapter: vercel({
    analytics: true,
    webAnalytics: {
      enabled: true,
    },
  }),
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
