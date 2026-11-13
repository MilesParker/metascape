// SPDX-License-Identifier: EPL-2.0
import { create } from 'zustand';

interface ShellState {
  readonly palette: boolean;
  readonly help: boolean;
  openPalette(): void;
  openHelp(): void;
  setPalette(open: boolean): void;
  setHelp(open: boolean): void;
}

/** Which of the shell's overlays are open. */
export const useShell = create<ShellState>((set) => ({
  palette: false,
  help: false,
  openPalette: () => set({ palette: true, help: false }),
  openHelp: () => set({ help: true, palette: false }),
  setPalette: (palette) => set({ palette }),
  setHelp: (help) => set({ help }),
}));
