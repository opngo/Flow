export type ThemeTokens = {
  surface: string; s1: string; s2: string; s3: string;
  text: string; muted: string; faint: string;
  accent: string; success: string; warning: string; danger: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  dark: ThemeTokens;
  light: ThemeTokens;
};

const baseDark = {
  text: '#e9ecf3', muted: '#9aa2b4', faint: '#6b7383',
  accent: '#7c8cff', success: '#4ec9a0', warning: '#e5b567', danger: '#ef6f6c',
};
const baseLight = {
  text: '#181b22', muted: '#5d6472', faint: '#8b929f',
  accent: '#5865f2', success: '#1f9d74', warning: '#b8791c', danger: '#d3453f',
};

export const PRESETS: ThemePreset[] = [
  {
    id: 'midnight', name: 'Midnight', mode: 'dark',
    dark: { ...baseDark, surface: '#0b0d12', s1: '#12151c', s2: '#181c25', s3: '#1f242f' },
    light: { ...baseLight, surface: '#f6f7fa', s1: '#ffffff', s2: '#eef0f5', s3: '#e4e7ee' },
  },
  {
    id: 'slate', name: 'Slate', mode: 'dark',
    dark: { ...baseDark, text: '#e8eaf0', surface: '#111318', s1: '#171a20', s2: '#1e222a', s3: '#262b34' },
    light: { ...baseLight, surface: '#f4f5f7', s1: '#fbfbfc', s2: '#eceef2', s3: '#e2e5eb' },
  },
  {
    id: 'forest', name: 'Forest', mode: 'dark',
    dark: { ...baseDark, surface: '#0a1210', s1: '#101a17', s2: '#16211d', s3: '#1e2b26', accent: '#57c9a0' },
    light: { ...baseLight, surface: '#f4f8f6', s1: '#ffffff', s2: '#eaf2ee', s3: '#dfeae4' },
  },
  {
    id: 'plum', name: 'Plum', mode: 'dark',
    dark: { ...baseDark, surface: '#100b14', s1: '#171020', s2: '#1f1529', s3: '#281c34', accent: '#b18cff' },
    light: { ...baseLight, surface: '#f8f5fb', s1: '#ffffff', s2: '#f1ebf7', s3: '#e8e0f1', accent: '#7c4dd6' },
  },
  {
    id: 'paper', name: 'Paper', mode: 'light',
    dark: { ...baseDark, surface: '#14130f', s1: '#1c1a16', s2: '#24211c', s3: '#2d2924', accent: '#c9a227' },
    light: { ...baseLight, surface: '#faf7f1', s1: '#ffffff', s2: '#f2ede3', s3: '#e9e2d5', accent: '#9a6b1f' },
  },
  {
    id: 'solar', name: 'Solar', mode: 'light',
    dark: { ...baseDark, surface: '#0d0f16', s1: '#131722', s2: '#1a1f2c', s3: '#222838', accent: '#f0a75a' },
    light: { ...baseLight, surface: '#fdf8f0', s1: '#ffffff', s2: '#f6efe2', s3: '#eee5d4', accent: '#c9741b' },
  },
];

export const ACCENTS = ['#7c8cff', '#57c9a0', '#f0a75a', '#ef6f6c', '#b18cff', '#4db6e5', '#e577b5', '#c9d24b'];

export function resolveTokens(presetId: string, mode: 'dark' | 'light' | 'system', accent?: string, overrides: Record<string, string> = {}): ThemeTokens {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const effective = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : mode;
  const tokens = { ...(effective === 'light' ? preset.light : preset.dark) };
  if (accent) tokens.accent = accent;
  Object.assign(tokens, overrides);
  return tokens;
}

export const FONTS = [
  // The two bundled faces come first: they ship with the app, so choosing them
  // costs no network request and looks the same offline.
  { id: 'Satoshi', stack: "'Satoshi', 'Inter', system-ui, sans-serif" },
  { id: 'Sentient', stack: "'Sentient', Georgia, serif" },
  { id: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { id: 'Geist', stack: "'Geist', 'Inter', system-ui, sans-serif" },
  { id: 'DM Sans', stack: "'DM Sans', system-ui, sans-serif" },
  { id: 'Manrope', stack: "'Manrope', system-ui, sans-serif" },
  { id: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: 'Space Grotesk', stack: "'Space Grotesk', system-ui, sans-serif" },
  { id: 'IBM Plex Sans', stack: "'IBM Plex Sans', system-ui, sans-serif" },
  { id: 'Lora', stack: "'Lora', Georgia, serif" },
  { id: 'Playfair Display', stack: "'Playfair Display', Georgia, serif" },
  { id: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, monospace" },
  { id: 'Fira Code', stack: "'Fira Code', ui-monospace, monospace" },
  { id: 'System', stack: 'system-ui, -apple-system, sans-serif' },
  { id: 'System Mono', stack: 'ui-monospace, SFMono-Regular, monospace' },
];

export function fontStack(name: string): string {
  return FONTS.find((f) => f.id === name)?.stack ?? `'${name}', system-ui, sans-serif`;
}

export function applyTheme(opts: {
  preset: string; mode: 'dark' | 'light' | 'system'; accent: string; overrides: Record<string, string>;
  density: number; radius: number; blur: number; reduceMotion: boolean;
  corners?: 'rounded' | 'sharp';
  labels?: 'full' | 'minimal' | 'none';
  typography: { ui: string; content: string; timer: string; mono: string; baseSize: number; lineHeight: number; letterSpacing: number; weight: number; headingScale: number };
}) {
  const root = document.documentElement;
  const t = resolveTokens(opts.preset, opts.mode, opts.accent, opts.overrides);
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--surface', t.surface); set('--surface-1', t.s1); set('--surface-2', t.s2); set('--surface-3', t.s3);
  set('--text', t.text); set('--text-muted', t.muted); set('--text-faint', t.faint);
  set('--accent', t.accent);
  set('--accent-soft', `color-mix(in srgb, ${t.accent} 18%, transparent)`);
  set('--success', t.success); set('--warning', t.warning); set('--danger', t.danger);
  // One token drives both the named surfaces (`.panel`, `.input`) and every
  // literal `rounded-[Npx]` utility, through --radius-scale in styles.css.
  const radius = opts.corners === 'sharp' ? 0 : opts.radius;
  set('--radius', `${radius}px`);
  set('--radius-scale', String(Math.max(0, radius) / 16));
  root.dataset.corners = opts.corners === 'sharp' ? 'sharp' : 'rounded';
  root.dataset.labels = opts.labels ?? 'full';
  set('--blur', `${opts.blur}px`);
  set('--pad', String(opts.density));
  const y = opts.typography;
  set('--font-ui', fontStack(y.ui)); set('--font-content', fontStack(y.content));
  set('--font-timer', fontStack(y.timer)); set('--font-mono', fontStack(y.mono));
  set('--fs-base', `${y.baseSize}px`); set('--lh', String(y.lineHeight));
  set('--ls', `${y.letterSpacing}em`); set('--fw', String(y.weight));
  set('--heading-scale', String(y.headingScale));
  const light = opts.mode === 'light' || (opts.mode === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  root.classList.toggle('dark', !light);
  root.dataset.reduceMotion = String(opts.reduceMotion);
  document.body.style.colorScheme = light ? 'light' : 'dark';
}
