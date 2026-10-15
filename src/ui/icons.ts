// A small stroke icon set drawn for Artifact (24×24 grid, 1.75 stroke).
import { h } from 'preact';

const PATHS = {
  bookmark: 'M7 4h10v16l-5-3.5L7 20z',
  bookmarkFill: 'M7 4h10v16l-5-3.5L7 20z',
  tag: 'M4 4h7l9 9-7 7-9-9zM8.5 8.5h.01',
  folder: 'M3 6h6l2 2h10v11H3z',
  search: 'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20',
  close: 'M6 6l12 12M18 6 6 18',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  pin: 'M9 4h6l-1 6 4 3H6l4-3zM12 13v7',
  star: 'M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.2 7 19l1.2-5.6L4 9.6 9.6 9z',
  note: 'M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 16h6',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  plus: 'M12 5v14M5 12h14',
  highlight: 'M4 20h7M14.5 4.5l5 5L10 19H5v-5z',
  chain: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  rtl: 'M20 6H9M20 10H12M20 14H9M20 18H12M7 9l-3 3 3 3',
  queue: 'M4 6h16M4 12h10M4 18h7M17 15v6M14 18h6',
  tree: 'M6 4v16M6 8h6a3 3 0 0 1 3 3v1M6 16h6M15 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM12 16a2 2 0 1 0 4 0',
  collapse: 'M6 9l6-6 6 6M6 15l6 6 6-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 14, label }: { name: IconName; size?: number; label?: string }) {
  const filled = name === 'bookmarkFill';
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      role: label ? 'img' : undefined,
      'aria-label': label,
      'aria-hidden': label ? undefined : 'true',
      focusable: 'false',
    },
    h('path', { d: PATHS[name] }),
  );
}
