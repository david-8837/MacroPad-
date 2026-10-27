/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kadowaz: {
          orange: '#FF5E00',
          orangeDark: '#D44C00',
          orangeGlow: 'rgba(255, 94, 0, 0.4)',
          metalDark: '#121316',
          metalMid: '#1C1E24',
          metalLight: '#262A33',
          keyNavy: '#1E2430',
          keyNavyHover: '#293242',
          keyNavyActive: '#171B24',
          oledBg: '#090A0C',
          oledCyan: '#00F0FF',
          oledAmber: '#FFB800',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'chassis': '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'key-raised': '0 6px 0 #0D1017, 0 10px 15px rgba(0,0,0,0.5)',
        'key-pressed': '0 1px 0 #0D1017, 0 2px 5px rgba(0,0,0,0.5)',
        'orange-glow': '0 0 25px rgba(255, 94, 0, 0.45)',
        'knob': '0 8px 20px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.25), inset 0 -2px 4px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [],
}
