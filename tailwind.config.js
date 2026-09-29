/** @type {import('tailwindcss').Config} */
export default {
  include: ["src/**/*.{html,js,jsx,ts,tsx,astro,svelte}"],
  darkMode: ["class"],
  content: [
    "./src/**/*.{html,js,jsx,ts,tsx,astro,svelte}",
    "./src/components/**/*.{js,ts,svelte,astro}",
    "./src/pages/**/*.{js,ts,svelte,astro}",
  ],
  theme: {
    extend: {
      // Recess: everything soft. Pills are rounded-full.
      borderRadius: {
        DEFAULT: "8px",
        sm: "8px",
        md: "14px",
        lg: "18px",
        xl: "22px",
        "2xl": "28px",
      },
      fontFamily: {
        display: ["Fredoka", "Nunito", "system-ui", "sans-serif"],
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
      colors: {
        // The --sr- design tokens (globals.css), so markup can use them and
        // follow the theme. No opacity modifiers: the tokens are plain hex.
        sr: {
          ground: "var(--sr-ground)",
          panel: "var(--sr-panel)",
          raise: "var(--sr-raise)",
          track: "var(--sr-track)",
          tint: "var(--sr-tint)",
          hairline: "var(--sr-hairline)",
          ink: "var(--sr-ink)",
          "ink-2": "var(--sr-ink-2)",
          muted: "var(--sr-muted)",
          faint: "var(--sr-faint)",
          action: "var(--sr-action)",
          "action-fg": "var(--sr-action-fg)",
          "action-ink": "var(--sr-action-ink)",
          "hairline-2": "var(--sr-hairline-2)",
          paper: "var(--sr-paper)",
          brass: "var(--sr-brass)",
          "brass-bg": "var(--sr-brass-bg)",
          danger: "var(--sr-danger)",
          "danger-bg": "var(--sr-danger-bg)",
          // The pastels, each with the ink that reads on it.
          mint: "var(--sr-mint)",
          "mint-ink": "var(--sr-mint-ink)",
          peach: "var(--sr-peach)",
          "peach-ink": "var(--sr-peach-ink)",
          butter: "var(--sr-butter)",
          "butter-ink": "var(--sr-butter-ink)",
          sky: "var(--sr-sky)",
          "sky-ink": "var(--sr-sky-ink)",
          // The playback bar, a dark strip in both themes.
          bar: "var(--sr-bar)",
          "bar-btn": "var(--sr-bar-btn)",
          "bar-btn-hi": "var(--sr-bar-btn-hi)",
          "bar-menu": "var(--sr-bar-menu)",
          "bar-line": "var(--sr-bar-line)",
          "bar-ink": "var(--sr-bar-ink)",
          "bar-muted": "var(--sr-bar-muted)",
          "bar-on": "var(--sr-bar-on)",
          "bar-accent": "var(--sr-bar-accent)",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")], // You can add any Tailwind plugins here if needed
};
