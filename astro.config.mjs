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
      // zod is bundled so each importer gets its own copy: better-auth is
      // bundled and needs zod 4, but an external `zod` resolves at runtime to
      // the top-level zod 3 that Astro 4 brings ("z.looseObject is not a
      // function" on every auth route).
      noExternal: ["abcjs", "zod"],
    },
    server: {
      // Allow access from any host (Tailscale, LAN, phones, etc.) during dev.
      // Vite blocks non-localhost hostnames by default for security.
      allowedHosts: true,
    },
  },
});
