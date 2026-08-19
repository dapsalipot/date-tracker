import type { StopKind } from '@/domain/stops/taxonomy';

export type ThemeName = 'light' | 'dark';

export interface Lift {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Theme {
  name: ThemeName;
  role: {
    ground: string;
    surface: string;
    surfaceSunk: string;
    line: string;
    ink: string;
    inkMuted: string;
    primary: string;
    onPrimary: string;
  };
  kind: Record<StopKind, string>;
  /** Null in dark on purpose — see the theme test. */
  lift: Lift | null;
}

/** Aged paper. Ratios in the spec are computed, not estimated. */
export const lightTheme: Theme = {
  name: 'light',
  role: {
    ground: '#EFE4D4',
    surface: '#FBF4EA',
    surfaceSunk: '#F5EBDC',
    line: '#E0CFB4',
    ink: '#2A2018',
    inkMuted: '#6B5A47',
    primary: '#A61B34',
    onPrimary: '#FFFFFF',
  },
  kind: {
    food: '#8A5E0A',
    transport: '#2F7D4F',
    activity: '#17706B',
    shopping: '#2A5DA8',
    gift: '#7A3FA8',
    other: '#6B5A47',
  },
  lift: {
    shadowColor: '#3A2A18',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
};

/**
 * Night, warmed off pure slate. The accent inverts to coral because crimson on
 * this ground measures under 3:1 and cannot carry a filled button.
 */
export const darkTheme: Theme = {
  name: 'dark',
  role: {
    ground: '#121420',
    surface: '#1E2130',
    surfaceSunk: '#181B27',
    line: '#2C3040',
    ink: '#EFEDF5',
    inkMuted: '#9A9AAE',
    primary: '#FF8A5C',
    onPrimary: '#1A1206',
  },
  kind: {
    food: '#F5C242',
    transport: '#6BD97F',
    activity: '#3DD6C4',
    shopping: '#5B9DFF',
    gift: '#C77DFF',
    other: '#9A9AAE',
  },
  lift: null,
};

export const themes: Record<ThemeName, Theme> = { light: lightTheme, dark: darkTheme };
