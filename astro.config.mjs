import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  output: "server",
  adapter: vercel({
    maxDuration: 60,
    runtime: "nodejs22.x",
  }),
  integrations: [svelte(), tailwind()],
  vite: {
    ssr: {
      noExternal: ["abcjs"],
    },
  },
});
