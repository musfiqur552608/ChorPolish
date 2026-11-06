export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveIsDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(options: {
  theme: ThemeMode;
  isDark: boolean;
}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', options.isDark);
  root.style.colorScheme = options.isDark ? 'dark' : 'light';

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', options.isDark ? '#121a22' : '#f8f1df');
  }
}
