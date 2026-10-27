delete process.env.ELECTRON_RUN_AS_NODE;
const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

const child = spawn(electron, [path.join(__dirname, '..'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: false
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

