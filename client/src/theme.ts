export type ThemeName = 'onyx' | 'cyberpunk' | 'midnight' | 'dracula' | 'nord';

export interface ThemeConfig {
  id: ThemeName;
  name: string;
  desc: string;
  bg: string;
  card: string;
  cardHover: string;
  accent: string;
  glow: string;
  border: string;
}

export const THEMES: Record<ThemeName, ThemeConfig> = {
  onyx: {
    id: 'onyx',
    name: 'Pure Onyx',
    desc: 'Глубокий смоляной черный (#07080c) с мягким контрастом',
    bg: '#07080c',
    card: 'rgba(255, 255, 255, 0.03)',
    cardHover: 'rgba(255, 255, 255, 0.07)',
    accent: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.2)',
    border: 'rgba(255, 255, 255, 0.08)',
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    desc: 'Неоновый пурпур и кибер-розовый акцент',
    bg: '#0c0717',
    card: 'rgba(168, 85, 247, 0.08)',
    cardHover: 'rgba(168, 85, 247, 0.16)',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.25)',
    border: 'rgba(168, 85, 247, 0.35)',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Blue',
    desc: 'Глубокий океанический индиго и сапфир',
    bg: '#060b1c',
    card: 'rgba(56, 189, 248, 0.07)',
    cardHover: 'rgba(56, 189, 248, 0.15)',
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.25)',
    border: 'rgba(56, 189, 248, 0.28)',
  },
  dracula: {
    id: 'dracula',
    name: 'Dracula',
    desc: 'Легендарная палитра Dracula с фиолетовыми акцентами',
    bg: '#181924',
    card: 'rgba(189, 147, 249, 0.09)',
    cardHover: 'rgba(189, 147, 249, 0.18)',
    accent: '#bd93f9',
    glow: 'rgba(189, 147, 249, 0.25)',
    border: 'rgba(189, 147, 249, 0.32)',
  },
  nord: {
    id: 'nord',
    name: 'Nord Frost',
    desc: 'Северная арктическая тема со снежным синим',
    bg: '#20252e',
    card: 'rgba(136, 192, 208, 0.08)',
    cardHover: 'rgba(136, 192, 208, 0.16)',
    accent: '#88c0d0',
    glow: 'rgba(136, 192, 208, 0.25)',
    border: 'rgba(136, 192, 208, 0.3)',
  },
};

export function applyTheme(themeName: ThemeName) {
  const theme = THEMES[themeName] || THEMES.onyx;
  document.documentElement.setAttribute('data-theme', themeName);
  document.documentElement.style.setProperty('--bg-main', theme.bg);
  document.documentElement.style.setProperty('--bg-card', theme.card);
  document.documentElement.style.setProperty('--bg-card-hover', theme.cardHover);
  document.documentElement.style.setProperty('--border-color', theme.border);
  document.documentElement.style.setProperty('--accent-color', theme.accent);
  document.documentElement.style.setProperty('--accent-glow', theme.glow);
  document.documentElement.style.backgroundColor = theme.bg;
  document.body.style.backgroundColor = theme.bg;

  const root = document.getElementById('root');
  if (root) {
    root.style.backgroundColor = theme.bg;
  }

  // Update Windows titlebar color if available
  const win = window as unknown as { setWindowCaptionColor?: (hexColor: string) => void };
  if (typeof win.setWindowCaptionColor === 'function') {
    win.setWindowCaptionColor(theme.bg);
  }

  localStorage.setItem('dj_theme', themeName);
}
