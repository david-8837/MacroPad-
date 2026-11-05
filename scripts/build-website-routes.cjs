// Generate clean directory URLs for static hosts such as GitHub Pages.
// The root HTML files are the sources of truth; route copies need one extra
// parent level for local href and src attributes.
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..', 'website');
function renderPage(source) {
  return source.replace(/\b(href|src)="\.\//g, '$1="../');
}
if (require.main === module) {
  for (const [directory, source] of [['home', 'index.html'], ['cases', 'cases.html']]) {
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, 'index.html'), renderPage(readFileSync(join(root, source), 'utf8')));
  }
}
module.exports = { renderPage };
