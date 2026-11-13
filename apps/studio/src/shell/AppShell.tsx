// SPDX-License-Identifier: EPL-2.0
import { Outlet, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCommands, useShortcuts } from '../lib/commands';
import { useTheme } from '../lib/theme';
import { TooltipProvider } from '../ui/primitives';
import { CommandPalette } from './CommandPalette';
import { useShell } from './shell-state';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Toaster } from './toast';

/** What every page shares: global commands and shortcuts, the palette, help and toasts. */
export function AppShell(): ReactElement {
  const navigate = useNavigate();
  const openPalette = useShell((state) => state.openPalette);
  const openHelp = useShell((state) => state.openHelp);
  const toggleTheme = useTheme((state) => state.toggle);
  useShortcuts();
  useCommands([
    {
      id: 'palette',
      label: 'Command palette',
      group: 'General',
      keys: 'mod+k',
      hidden: true,
      run: openPalette,
    },
    { id: 'help', label: 'Keyboard shortcuts', group: 'General', keys: '?', run: openHelp },
    {
      id: 'theme',
      label: 'Light or dark',
      group: 'General',
      keys: 't',
      keywords: 'theme dark light',
      run: toggleTheme,
    },
    {
      id: 'library',
      label: 'Library',
      group: 'General',
      keys: 'g',
      keywords: 'home models',
      run: () => void navigate({ to: '/', search: {} }),
    },
  ]);
  return (
    <TooltipProvider>
      <Outlet />
      <CommandPalette />
      <ShortcutsDialog />
      <Toaster />
    </TooltipProvider>
  );
}
