import type { DiscoveredApp } from '../types';

export const APP_LIBRARY_KEY = 'kadowaz_app_library';
const APP_ICON_VERSION_KEY = 'kadowaz_app_library_icon_version';
const APP_ICON_VERSION = '2';
const CORRUPT = 'The saved application library could not be read. It was preserved; newly found applications are available only for this session.';
const UNAVAILABLE = 'The application library could not be saved. Newly found applications are available only for this session.';

// Older caches may omit icon or validity metadata, but fields used by search and
// launch must be strings. Preserve malformed raw data rather than overwriting it.
function normalize(value: unknown): DiscoveredApp[] | null {
  if (!Array.isArray(value)) return null;
  const apps: DiscoveredApp[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !['id', 'name', 'exePath', 'category', 'source'].every(key => typeof item[key] === 'string') ||
      !['iconDataUrl', 'iconPath', 'launchArgs', 'appId'].every(key => item[key] === undefined || typeof item[key] === 'string') ||
      (item.isValid !== undefined && typeof item.isValid !== 'boolean') ||
      (item.targetType !== undefined && !['executable', 'uwp', 'shortcut'].includes(item.targetType)) ||
      (item.lastAssignedAt !== undefined && (typeof item.lastAssignedAt !== 'number' || !Number.isFinite(item.lastAssignedAt)))) return null;
    apps.push({ ...item, iconDataUrl: item.iconDataUrl ?? '', isValid: item.isValid ?? false, launchArgs: item.launchArgs ?? '' });
  }
  return apps;
}

export function readAppLibrary(): { apps: DiscoveredApp[]; error: string | null } {
  try {
    const raw = localStorage.getItem(APP_LIBRARY_KEY);
    if (raw === null) return { apps: [], error: null };
    const apps = normalize(JSON.parse(raw));
    return apps ? { apps, error: null } : { apps: [], error: CORRUPT };
  } catch { return { apps: [], error: CORRUPT }; }
}

export function loadAppLibrary(): DiscoveredApp[] { return readAppLibrary().apps; }

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

/** Do not replace unreadable data; quota failures leave the session list usable. */
export function saveAppLibrary(apps: DiscoveredApp[], iconsRefreshed = false): string | null {
  const previous = readAppLibrary();
  if (previous.error) return previous.error;
  if (!normalize(apps)) return 'The discovered application list was invalid and was not saved.';
  try {
    localStorage.setItem(APP_LIBRARY_KEY, JSON.stringify(apps));
    if (iconsRefreshed) localStorage.setItem(APP_ICON_VERSION_KEY, APP_ICON_VERSION);
    return null;
  } catch { return UNAVAILABLE; }
}
