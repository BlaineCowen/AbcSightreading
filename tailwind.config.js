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
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
          brass: "var(--sr-brass)",
          "brass-bg": "var(--sr-brass-bg)",
          danger: "var(--sr-danger)",
          "danger-bg": "var(--sr-danger-bg)",
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
