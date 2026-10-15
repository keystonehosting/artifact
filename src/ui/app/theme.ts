import { useEffect, useState } from 'preact/hooks';

/** Applies the theme setting to extension pages; "system" follows the OS. */
export function useTheme(theme: 'system' | 'light' | 'dark'): void {
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
}

/** Whether extension pages currently render dark, for colors set in code. */
export function useResolvedDark(): boolean {
  const read = () => {
    const forced = document.documentElement.getAttribute('data-theme');
    return forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(read());
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    mq.addEventListener('change', update);
    return () => {
      obs.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);
  return dark;
}
