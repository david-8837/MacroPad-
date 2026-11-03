import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    // Local development and Arena preview hosts only; do not allow arbitrary
    // domains to reach the dev server through DNS rebinding.
    allowedHosts: ['.e2b.app'],
  },
  base: './',
});
