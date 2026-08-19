import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { db } from '@/db/client';
import { getAppDeps } from '@/session';
import { readSetting, writeSetting, THEME_KEY } from '@/domain/settings/settings';
import { themes, type Theme, type ThemeName } from './themes';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function storedName(): ThemeName {
  // Anything unrecognised falls back rather than crashing: the column is free
  // text, and a bad value must not brick the app on launch.
  return readSetting(db, THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>(storedName);

  const toggle = useCallback(() => {
    setName((current) => {
      const next: ThemeName = current === 'light' ? 'dark' : 'light';
      writeSetting(db, getAppDeps(), THEME_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme: themes[name], toggle }), [name, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme called outside ThemeProvider');
  return ctx.theme;
}

export function useThemeToggle(): () => void {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useThemeToggle called outside ThemeProvider');
  return ctx.toggle;
}
