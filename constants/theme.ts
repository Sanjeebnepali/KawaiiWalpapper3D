export const Colors = {
  bg: '#131313',
  bgAlt: '#1A1A1A',
  surface: '#1E1E1E',
  surfaceHi: '#2A2A2A',
  border: '#333333',
  borderHi: 'rgba(255,255,255,0.18)',

  // Primary = soft pink. All active/CTA states use this.
  pink: '#fab3ca',
  pinkDim: 'rgba(250,179,202,0.18)',
  // Secondary = soft purple. Decorative.
  lavender: '#dcb8ff',
  lavenderDim: 'rgba(220,184,255,0.18)',
  cyan: '#00E5FF',
  cyanDim: 'rgba(0,229,255,0.18)',
  gold: '#E8C275',
  error: '#ffb4ab',

  text: '#e5e2e1',
  textDim: '#B0B0B0',
  textMute: '#6E6E6E',

  glassFill: 'rgba(30,30,30,0.6)',
  glassStroke: '#333333',
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Type = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: Colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: Colors.text, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  body: { fontSize: 14, fontWeight: '500' as const, color: Colors.text },
  caption: { fontSize: 12, fontWeight: '500' as const, color: Colors.textDim },
  tiny: { fontSize: 11, fontWeight: '600' as const, color: Colors.textDim, letterSpacing: 0.4 },
} as const;

/**
 * Premium color themes (Task 2 / DEVELOPMENT_BRIEF Phase 2).
 *
 * Each theme is a self-contained token set. The selected theme id lives in
 * `store/settings.ts` (`theme`). `Themes[0]` ("Kawaii Dark") mirrors the
 * `Colors` export above so the default look is unchanged.
 *
 * NOTE: the picker UI + persistence are wired now; threading these tokens
 * through every screen (via a ThemeProvider context) is the remaining step —
 * see changes/010.
 */
export type ThemeDef = {
  id: string;
  name: string;
  primary: string;   // active / CTA accent
  secondary: string; // decorative accent
  bg: string;        // screen background
  surface: string;   // card / panel background
  text: string;
  textDim: string;
  shadow: string;    // card glow color
  gradient: [string, string]; // preview tile + hero gradient
};

export const Themes: ThemeDef[] = [
  {
    id: 'kawaii-dark', name: 'Kawaii Dark',
    primary: '#fab3ca', secondary: '#dcb8ff',
    bg: '#131313', surface: '#1E1E1E',
    text: '#e5e2e1', textDim: '#B0B0B0',
    shadow: '#fab3ca', gradient: ['#fab3ca', '#dcb8ff'],
  },
  {
    id: 'sunset-gradient', name: 'Sunset Gradient',
    primary: '#FF8A5C', secondary: '#FF5C8A',
    bg: '#1A1310', surface: '#241914',
    text: '#F5EAE4', textDim: '#C2A99E',
    shadow: '#FF7A4D', gradient: ['#FF8A5C', '#FF5C8A'],
  },
  {
    id: 'ocean-blue', name: 'Ocean Blue',
    primary: '#4DA6FF', secondary: '#00E5FF',
    bg: '#0E1620', surface: '#16212E',
    text: '#E4EEF5', textDim: '#9DB0C0',
    shadow: '#2E8FE0', gradient: ['#1E5A8A', '#00E5FF'],
  },
  {
    id: 'forest-green', name: 'Forest Green',
    primary: '#4CC38A', secondary: '#9BE86B',
    bg: '#0F1813', surface: '#16241C',
    text: '#E4F0E8', textDim: '#9DB5A6',
    shadow: '#3CA875', gradient: ['#1E5A3C', '#4CC38A'],
  },
  {
    id: 'purple-cosmic', name: 'Purple Cosmic',
    primary: '#B57BFF', secondary: '#7C4DFF',
    bg: '#15101F', surface: '#1F182E',
    text: '#EDE7F5', textDim: '#AC9FC2',
    shadow: '#9D5BFF', gradient: ['#3A1E6E', '#B57BFF'],
  },
  {
    id: 'rose-gold', name: 'Rose Gold',
    primary: '#E8C275', secondary: '#F2A9B8',
    bg: '#1B1512', surface: '#261E1A',
    text: '#F5EBE2', textDim: '#C5B2A4',
    shadow: '#E0B466', gradient: ['#E8C275', '#F2A9B8'],
  },
  {
    id: 'aurora-lights', name: 'Aurora Lights',
    primary: '#7DA6FF', secondary: '#73F0C8',
    bg: '#101521', surface: '#18202F',
    text: '#E6ECF5', textDim: '#A0AEC2',
    shadow: '#6E8FE0', gradient: ['#6E5AC8', '#73F0C8'],
  },
  {
    id: 'midnight-neon', name: 'Midnight Neon',
    primary: '#FF4DD2', secondary: '#00E5FF',
    bg: '#0B0B12', surface: '#15151F',
    text: '#ECE9F2', textDim: '#9B98AC',
    shadow: '#FF4DD2', gradient: ['#FF4DD2', '#00E5FF'],
  },
  {
    id: 'lavender-dreams', name: 'Lavender Dreams',
    primary: '#C9A7FF', secondary: '#FAB3CA',
    bg: '#16131C', surface: '#201C29',
    text: '#EEE9F5', textDim: '#AEA5BE',
    shadow: '#C9A7FF', gradient: ['#C9A7FF', '#FAB3CA'],
  },
];

export const DEFAULT_THEME_ID = Themes[0].id;

export const getThemeByName = (name: string): ThemeDef =>
  Themes.find((t) => t.name === name || t.id === name) ?? Themes[0];
