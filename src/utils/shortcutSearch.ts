import type { PCShortcut } from '../data/pcShortcuts';

/** Match the catalogue text or a key sequence with optional spaces around '+'. */
export function matchesShortcut(shortcut: PCShortcut, search: string, categoryLabel = ''): boolean {
  const query = search.toLowerCase().trim();
  if (!query) return true;
  const normalizedQuery = query.replace(/\s*\+\s*/g, '+');
  return [shortcut.name, shortcut.description, shortcut.appName || '', shortcut.category, categoryLabel, shortcut.keys.join(' ')]
    .some(value => value.toLowerCase().includes(query)) ||
    shortcut.keys.join('+').toLowerCase().includes(normalizedQuery);
}
