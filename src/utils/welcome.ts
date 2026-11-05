/** Show the welcome only for a fresh install, or one interrupted before the
 * welcome was dismissed. Never treat existing user settings as a fresh install. */
export function shouldShowWelcome(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): boolean {
  try {
    if (storage.getItem('kadowaz_guide_seen') === '1') return false;
    if (storage.getItem('kadowaz_welcome_pending') === '1') return true;
    for (let i = 0; i < storage.length; i++) {
      if (storage.key(i)?.startsWith('kadowaz_')) return false;
    }
    return true;
  } catch {
    // A storage restriction should not block the editor or imply a fresh install.
    return false;
  }
}
