/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary-fixed-dim": "#29d8fb",
        "tertiary-fixed": "#e9ddff",
        "on-primary-fixed-variant": "#004e5d",
        "surface-dim": "#d9dade",
        "surface-container-lowest": "#ffffff",
        "surface-variant": "#e2e2e6",
        "outline": "#6c797e",
        "surface-bright": "#f9f9fd",
        "secondary": "#b7004f",
        "tertiary-fixed-dim": "#d1bcff",
        "surface-tint": "#00687a",
        "inverse-primary": "#29d8fb",
        "on-surface-variant": "#3c494d",
        "inverse-on-surface": "#f0f0f4",
        "surface": "#f9f9fd",
        "secondary-container": "#e40a65",
        "tertiary-container": "#cbb5ff",
        "background": "#f9f9fd",
        "surface-container-high": "#e8e8ec",
        "secondary-fixed-dim": "#ffb1c0",
        "on-primary": "#ffffff",
        "tertiary": "#7212ff",
        "secondary-fixed": "#ffd9df",
        "error-container": "#ffdad6",
        "on-surface": "#1a1c1f",
        "on-secondary-container": "#fffbff",
        "on-primary-container": "#005666",
        "inverse-surface": "#2f3034",
        "surface-container": "#eeedf2",
        "on-tertiary-container": "#6000dd",
        "on-background": "#1a1c1f",
        "on-tertiary-fixed-variant": "#5700c9",
        "on-tertiary": "#ffffff",
        "error": "#ba1a1a",
        "outline-variant": "#bbc9ce",
        "on-secondary-fixed-variant": "#90003d",
        "on-tertiary-fixed": "#23005b",
        "surface-container-low": "#f3f3f7",
        "on-error-container": "#93000a",
        "on-primary-fixed": "#001f26",
        "on-secondary-fixed": "#3f0017",
        "surface-container-highest": "#e2e2e6",
        "primary-fixed": "#adecff",
        "primary-container": "#18d2f5",
        "on-secondary": "#ffffff",
        "on-error": "#ffffff",
        "primary": "#00687a"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter": "24px",
        "unit": "8px",
        "margin-mobile": "16px",
        "margin-desktop": "64px",
        "container-max": "1280px"
      },
      fontFamily: {
        "label-md": ["Sora"],
        "body-md": ["Sora"],
        "body-lg": ["Sora"],
        "headline-xl-mobile": ["Sora"],
        "headline-md": ["Sora"],
        "headline-lg": ["Sora"],
        "body-sm": ["Sora"],
        "headline-xl": ["Sora"]
      },
      fontSize: {
        "label-md": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "body-md": ["16px", { "lineHeight": "24px", "letterSpacing": "0em", "fontWeight": "400" }],
        "body-lg": ["18px", { "lineHeight": "28px", "letterSpacing": "0em", "fontWeight": "400" }],
        "headline-xl-mobile": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "headline-md": ["24px", { "lineHeight": "32px", "letterSpacing": "0em", "fontWeight": "700" }],
        "headline-lg": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "700" }],
        "body-sm": ["14px", { "lineHeight": "20px", "letterSpacing": "0em", "fontWeight": "400" }],
        "headline-xl": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "800" }]
      }
    }
  }
}
