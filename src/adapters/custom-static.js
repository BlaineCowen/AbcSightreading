export default function customStaticAdapter() {
  return {
    ...createIntegration({
      // Default static adapter options
      fallback: null,
      precompress: false,
    }),
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            resolve: {
              alias: {
                "@/*": new URL("./src/*", import.meta.url),
              },
            },
          },
        });
      },
      "astro:build:done": ({ dir }) => {
        console.log(`Build output in: ${dir}`);
        // Add custom post-build logic here if needed
      },
    },
  };
}
