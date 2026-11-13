// SPDX-License-Identifier: EPL-2.0
import { create } from 'zustand';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'metascape:theme';

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage may be unavailable; the choice still holds for this page.
  }
}

/** Whether the page shows dark now, whatever the choice. */
export function isDark(): boolean {
  const theme = document.documentElement.dataset['theme'];
  if (theme) return theme === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

interface ThemeState {
  readonly choice: ThemeChoice;
  set(choice: ThemeChoice): void;
  /** Flips between light and dark, from whatever shows now. */
  toggle(): void;
}

export const useTheme = create<ThemeState>((set) => ({
  choice: typeof localStorage === 'undefined' ? 'system' : stored(),
  set: (choice) => {
    applyTheme(choice);
    set({ choice });
  },
  toggle: () => {
    const choice: ThemeChoice = isDark() ? 'light' : 'dark';
    applyTheme(choice);
    set({ choice });
  },
}));
