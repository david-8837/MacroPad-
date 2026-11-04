/** Only show onboarding for an untouched installation; never rewrite saved data. */
export function shouldShowWelcome(storage: Pick<Storage, 'length' | 'key'>): boolean {
  try {
    for (let i = 0; i < storage.length; i++) {
      if (storage.key(i)?.startsWith('kadowaz_')) return false;
    }
    return true;
  } catch {
    // A storage restriction should not block the editor or imply a fresh install.
    return false;
  }
}
