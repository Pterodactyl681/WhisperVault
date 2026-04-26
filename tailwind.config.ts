import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      fontFamily: {
        sans: [
          "Popping-Cute",
          "Segoe UI",
          "Inter",
          "Noto Sans",
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "ui-sans-serif",
          "system-ui"
        ]
      },
      fontSize: {
        xs: ["0.9rem", { lineHeight: "1.4" }],
        sm: ["1.05rem", { lineHeight: "1.5" }],
        base: ["1.2rem", { lineHeight: "1.6" }],
        lg: ["1.35rem", { lineHeight: "1.55" }],
        xl: ["1.5rem", { lineHeight: "1.3" }],
        "2xl": ["1.8rem", { lineHeight: "1.25" }],
        "3xl": ["2.25rem", { lineHeight: "1.18" }],
        "4xl": ["2.7rem", { lineHeight: "1.12" }]
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          500: "#6F67D8",
          600: "#4ED7FF"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(92deg, #6F67D8 0%, #4ED7FF 100%)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        premium: "0 0 0 1px rgba(96, 118, 168, 0.22), 0 16px 34px -26px rgba(78, 215, 255, 0.35)",
        soft: "0 0 24px -8px rgba(78, 215, 255, 0.28)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0px)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.55s ease-out"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
