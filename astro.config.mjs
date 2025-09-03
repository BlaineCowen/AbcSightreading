import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  output: "server",
  adapter: vercel({
    maxDuration: 60,
    // No runtime specified - let Vercel decide
  }),
  integrations: [svelte(), tailwind()],
  vite: {
    ssr: {
      noExternal: ["abcjs"],
    },
  },
});
