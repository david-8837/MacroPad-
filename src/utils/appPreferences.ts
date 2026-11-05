export type AppTheme = 'light' | 'dark';
const THEME_KEY = 'kadowaz_app_theme';
const INTRO_KEY = 'kadowaz_opening_animation';

export function readThemeForStartup(): { theme: AppTheme; storageAvailable: boolean } {
  try { return { theme: localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light', storageAvailable: true }; }
  catch { return { theme: 'light', storageAvailable: false }; }
}
export function readTheme(): AppTheme { return readThemeForStartup().theme; }


export function readOpeningAnimation(): boolean {
  try { return localStorage.getItem(INTRO_KEY) !== 'off'; }
  catch { return true; }
}

export function saveTheme(theme: AppTheme): boolean {
  try { localStorage.setItem(THEME_KEY, theme); return true; }
  catch { return false; }
}

export function saveOpeningAnimation(enabled: boolean): boolean {
  try { localStorage.setItem(INTRO_KEY, enabled ? 'on' : 'off'); return true; }
  catch { return false; }
}

export function applyTheme(theme: AppTheme, persist = false): Promise<boolean> {
  document.documentElement.dataset.theme = theme;
  // Keep the native Windows caption buttons coordinated with the app, without
  // exposing arbitrary window styling to the renderer.
  const setWindowTheme = window.electronAPI?.setWindowTheme;
  return setWindowTheme ? setWindowTheme(theme, persist) : Promise.resolve(true);
}
