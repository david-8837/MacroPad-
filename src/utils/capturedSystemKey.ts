/** Normalize system keys Chromium actually exposes to the editor. Some laptop
 * Fn/brightness keys are handled by the OS and produce no key event at all. */
export function capturedSystemKey(key: string, code: string): string | null {
  const aliases: Record<string, string> = {
    BrightnessUp: 'BrightnessUp', DisplayBrightnessUp: 'BrightnessUp',
    BrightnessDown: 'BrightnessDown', DisplayBrightnessDown: 'BrightnessDown',
    MediaTrackNext: 'MediaTrackNext', MediaNextTrack: 'MediaTrackNext',
    MediaTrackPrevious: 'MediaTrackPrevious', MediaPreviousTrack: 'MediaTrackPrevious',
    MediaPlayPause: 'MediaPlayPause', MediaStop: 'MediaStop',
    AudioVolumeUp: 'AudioVolumeUp', VolumeUp: 'AudioVolumeUp',
    AudioVolumeDown: 'AudioVolumeDown', VolumeDown: 'AudioVolumeDown',
    AudioVolumeMute: 'AudioVolumeMute', VolumeMute: 'AudioVolumeMute',
  };
  return aliases[code] || aliases[key] || null;
}
