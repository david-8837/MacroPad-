// Keep the standalone product website deployable without a runtime bundler.
const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['website/components/specular-entry.jsx'],
  bundle: true,
  nodePaths: (process.env.NODE_PATH || '').split(require('path').delimiter).filter(Boolean),
  minify: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  format: 'iife',
  outfile: 'website/assets/specular-button.js',
  logLevel: 'info',
}).catch(() => { process.exitCode = 1; });
