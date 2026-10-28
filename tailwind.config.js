/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ---- Reality-First system (see /DESIGN.md) ---- */
        cream: '#E3E2DE',
        ink: '#141414',
        blue: '#1351AA',
        gray: '#444343',
        muted: '#7A7A7A',
        line: '#C7C7C7',
        surface: '#FFFFFF',
        well: '#EDECE8',
        shell: '#EFEEEA',

        /* Legacy aliases kept so older call sites still resolve;
           every one of them now renders inside the monochrome system. */
        kadowaz: {
          orange: '#1351AA',
          orangeDark: '#141414',
          orangeGlow: 'transparent',
          metalDark: '#E3E2DE',
          metalMid: '#EDECE8',
          metalLight: '#FFFFFF',
          keyNavy: '#FFFFFF',
          keyNavyHover: '#EDECE8',
          keyNavyActive: '#E3E2DE',
          oledBg: '#141414',
          oledCyan: '#1351AA',
          oledAmber: '#444343',
        },
      },
      fontFamily: {
        sans: ['"General Sans"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['"Switzer"', '"General Sans"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        label: '0.2em',
        tighter2: '-0.03em',
        display: '-0.04em',
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '0px',
      },
      /* Flat system: no shadows exist. Names kept for source compatibility. */
      boxShadow: {
        none: 'none',
        chassis: 'none',
        'key-raised': 'none',
        'key-pressed': 'none',
        'orange-glow': 'none',
        knob: 'none',
        xs: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '1' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'in': 'fade-in 0.001ms linear',
      },
    },
  },
  plugins: [],
}
