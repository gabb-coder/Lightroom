/** True on macOS/iOS, where shortcuts use Cmd instead of Ctrl. */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** "⌘" on Mac, "Ctrl+" elsewhere, for tooltips. */
export function modifierLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl+';
}
