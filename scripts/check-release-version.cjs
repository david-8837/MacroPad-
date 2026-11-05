'use strict';

// A release must advance past every existing app-version tag. This check runs
// only for an explicitly requested publication, not ordinary CI or site edits.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const semver = require('semver');

function validateReleaseVersion(version, lockfile, tags) {
  if (typeof version !== 'string' || semver.valid(version) !== version) {
    throw new Error(`Invalid app version: ${String(version)}`);
  }
  if (lockfile.version !== version || lockfile.packages?.['']?.version !== version) {
    throw new Error('package.json and package-lock.json versions do not match.');
  }
  const published = tags.map(tag => semver.valid(tag)).filter(Boolean).sort(semver.rcompare);
  if (published.length && !semver.gt(version, published[0])) {
    throw new Error(`App version ${version} is not newer than existing release ${published[0]}. Bump the version before publishing.`);
  }
  return published[0] || null;
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is missing or invalid.');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  // All release pages are checked, including drafts and prereleases. A failed
  // API request is an error, never permission to reuse a version.
  const result = execFileSync('gh', ['api', '--paginate', `repos/${repo}/releases?per_page=100`, '--jq', '.[].tag_name'], { encoding:'utf8' });
  const tags = result.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const previous = validateReleaseVersion(pkg.version, lock, tags);
  console.log(`Release version ${pkg.version} is newer than ${previous || 'all existing releases'}.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`Release version check failed: ${error.message}`); process.exitCode = 1; }
}
module.exports = { validateReleaseVersion };
