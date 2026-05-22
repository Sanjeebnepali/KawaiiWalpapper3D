import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getThemeByName, Themes, type ThemeDef } from '../constants/theme';
import { useSettingsStore } from '../store/settings';

/**
 * App-wide theme context (Issue 5).
 *
 * Reads the selected theme name from `store/settings.ts`, resolves it to a
 * full `ThemeDef`, and exposes it via `useTheme()`. Any component that calls
 * `useTheme()` re-renders when the user picks a new theme in Settings.
 *
 * `constants/theme.ts` `Colors` is still the static dark default — it's the
 * fallback and the base for tokens a `ThemeDef` doesn't override (borders,
 * cyan/gold decorative accents, etc.). Components migrate to `useTheme()`
 * incrementally; the app shell + screen backgrounds + nav chrome already do.
 */
const ThemeContext = createContext<ThemeDef>(Themes[0]);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeName = useSettingsStore((s) => s.theme);
  const theme = useMemo(() => getThemeByName(themeName), [themeName]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active `ThemeDef`. Safe to call anywhere under `<ThemeProvider>`. */
export const useTheme = (): ThemeDef => useContext(ThemeContext);
