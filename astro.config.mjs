import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

// Server output needed for API routes
export default defineConfig({
  output: "server",
  adapter: vercel(),
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
    build: {
      rollupOptions: {
        external: ["**/*.test.ts"],
      },
    },
  },
});
