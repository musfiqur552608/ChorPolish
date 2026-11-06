export type ThemeMode = 'light' | 'dark' | 'system';
export type PaperPresetId = 'cream' | 'white' | 'kraft' | 'mint' | 'sky' | 'blush' | 'lilac' | 'custom';
export type PaperSheet = Exclude<PaperPresetId, 'custom'>;

export interface PaperPreset {
  id: PaperSheet;
  /** Base paper hex used for the swatch and custom derivation. */
  color: string;
  labelEn: string;
  labelBn: string;
}

/** Built-in notebook sheets. Light/dark surfaces live in `index.css` as
 * `[data-paper]` palettes; this list only supplies the swatch + base hex. */
export const PAPER_PRESETS: PaperPreset[] = [
  { id: 'cream', color: '#f8f1df', labelEn: 'Cream', labelBn: 'ক্রিম' },
  { id: 'white', color: '#ffffff', labelEn: 'White', labelBn: 'সাদা' },
  { id: 'kraft', color: '#e9d6a8', labelEn: 'Kraft', labelBn: 'ক্রাফট' },
  { id: 'mint', color: '#e2f2e6', labelEn: 'Mint', labelBn: 'মিন্ট' },
  { id: 'sky', color: '#e3eef8', labelEn: 'Sky', labelBn: 'আকাশি' },
  { id: 'blush', color: '#f8e7e3', labelEn: 'Blush', labelBn: 'গোলাপি' },
  { id: 'lilac', color: '#ede7f6', labelEn: 'Lilac', labelBn: 'বেগুনি' },
];

export const DEFAULT_PAPER_COLOR = '#f8f1df';

const CSS_VARS = [
  '--paper',
  '--paper-light',
  '--paper-deep',
  '--paper-shadow',
  '--page',
  '--notebook',
] as const;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function channel(hex: string, index: 0 | 1 | 2): number {
  const normalized = normalizeHex(hex);
  return Number.parseInt(normalized.slice(1 + index * 2, 3 + index * 2), 16);
}

export function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return DEFAULT_PAPER_COLOR;
}

/** Mix `hex` toward `target`; `amount` is the fraction of the target (0..1). */
export function mixHex(hex: string, target: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const parts = [0, 1, 2].map((index) => {
    const from = channel(hex, index as 0 | 1 | 2);
    const to = channel(target, index as 0 | 1 | 2);
    return clampChannel(from + (to - from) * t)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

function scaleHex(hex: string, factor: number): string {
  const parts = [0, 1, 2].map((index) =>
    clampChannel(channel(hex, index as 0 | 1 | 2) * factor)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${parts.join('')}`;
}

/** Convert `#rrggbb` to the `"r g b"` triplet Tailwind's alpha modifiers need. */
export function hexToTriplet(hex: string): string {
  const normalized = normalizeHex(hex);
  return [0, 1, 2]
    .map((index) => channel(normalized, index as 0 | 1 | 2))
    .join(' ');
}

export interface PaperSurfaces {
  paper: string;
  paperLight: string;
  paperDeep: string;
  paperShadow: string;
  page: string;
  notebook: string;
}

/**
 * Derive paper surfaces from a custom sheet color. Presets are rendered from
 * static CSS palettes instead so they match before JS loads; this is only the
 * inline override path for `custom`.
 */
export function getPaperSurfaces(customColor: string, isDark: boolean): PaperSurfaces {
  const base = normalizeHex(customColor);
  if (isDark) {
    return {
      paper: mixHex(base, '#121a22', 0.8),
      paperLight: mixHex(base, '#232e3a', 0.68),
      paperDeep: mixHex(base, '#0c1219', 0.86),
      paperShadow: '#08100f',
      page: mixHex(base, '#10161f', 0.88),
      notebook: mixHex(base, '#28323f', 0.7),
    };
  }
  return {
    paper: base,
    paperLight: mixHex(base, '#ffffff', 0.5),
    paperDeep: scaleHex(base, 0.93),
    paperShadow: scaleHex(base, 0.84),
    page: scaleHex(base, 0.96),
    notebook: mixHex(base, '#ffffff', 0.6),
  };
}

export function resolveIsDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(options: {
  theme: ThemeMode;
  paperPreset: PaperPresetId;
  paperColor: string;
  isDark: boolean;
}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', options.isDark);
  root.style.colorScheme = options.isDark ? 'dark' : 'light';
  root.dataset.paper = options.paperPreset;

  if (options.paperPreset === 'custom') {
    const surfaces = getPaperSurfaces(options.paperColor, options.isDark);
    root.style.setProperty('--paper', hexToTriplet(surfaces.paper));
    root.style.setProperty('--paper-light', hexToTriplet(surfaces.paperLight));
    root.style.setProperty('--paper-deep', hexToTriplet(surfaces.paperDeep));
    root.style.setProperty('--paper-shadow', hexToTriplet(surfaces.paperShadow));
    root.style.setProperty('--page', hexToTriplet(surfaces.page));
    root.style.setProperty('--notebook', hexToTriplet(surfaces.notebook));
  } else {
    for (const variable of CSS_VARS) root.style.removeProperty(variable);
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    const isDark = options.isDark;
    const surfaces =
      options.paperPreset === 'custom'
        ? getPaperSurfaces(options.paperColor, isDark)
        : {
            page:
              PAPER_PRESETS.find((preset) => preset.id === options.paperPreset)?.color ??
              DEFAULT_PAPER_COLOR,
          } as { page: string };
    themeColor.setAttribute('content', isDark ? '#121a22' : surfaces.page);
  }
}
