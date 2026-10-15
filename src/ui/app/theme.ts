import { useEffect } from 'preact/hooks';

/** Applies the theme setting to extension pages; "system" follows the OS. */
export function useTheme(theme: 'system' | 'light' | 'dark'): void {
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
}
