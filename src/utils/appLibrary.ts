import type { DiscoveredApp } from '../types';

export const APP_LIBRARY_KEY = 'kadowaz_app_library';
const APP_ICON_VERSION_KEY = 'kadowaz_app_library_icon_version';
const APP_ICON_VERSION = '2';

export function loadAppLibrary(): DiscoveredApp[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(APP_LIBRARY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** Keep manually browsed entries when replacing an old discovery cache. */
export function mergeAppLibrary(existing: DiscoveredApp[], discovered: DiscoveredApp[]): DiscoveredApp[] {
  const ids = new Set(discovered.map(app => app.id));
  const custom = existing.filter(app => {
    if (app.source !== 'custom' || ids.has(app.id)) return false;
    ids.add(app.id);
    return true;
  });
  return [...custom, ...discovered];
}

export function appLibraryNeedsIconRefresh(apps: DiscoveredApp[]): boolean {
  try { return apps.length === 0 || localStorage.getItem(APP_ICON_VERSION_KEY) !== APP_ICON_VERSION; }
  catch { return apps.length === 0; }
}

/** A storage quota error must not prevent a successfully scanned list being used. */
export function saveAppLibrary(apps: DiscoveredApp[], iconsRefreshed = false): void {
  try {
    localStorage.setItem(APP_LIBRARY_KEY, JSON.stringify(apps));
    if (iconsRefreshed) localStorage.setItem(APP_ICON_VERSION_KEY, APP_ICON_VERSION);
  } catch { /* the current session can still use the scanned list */ }
}
