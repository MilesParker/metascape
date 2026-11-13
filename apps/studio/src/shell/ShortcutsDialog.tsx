// SPDX-License-Identifier: EPL-2.0
import { useMemo, type ReactElement } from 'react';
import { allCommands, displayKeys, useCommandStore } from '../lib/commands';
import { Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from '../ui/primitives';
import { useShell } from './shell-state';

/** `?`: every shortcut of the current page, from the same list as the palette. */
export function ShortcutsDialog(): ReactElement {
  const open = useShell((state) => state.help);
  const setOpen = useShell((state) => state.setHelp);
  const sources = useCommandStore((state) => state.sources);
  const commands = useMemo(() => allCommands(sources).filter((c) => c.keys), [sources]);
  const groups = [...new Set(commands.map((c) => c.group))];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-5">
        <DialogTitle className="text-base font-semibold">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="mt-1 text-muted">
          Everything here is also in the command palette.
        </DialogDescription>
        <div className="mt-4 grid max-h-[60vh] gap-x-8 gap-y-4 overflow-auto sm:grid-cols-2 scrollbar-thin">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="mb-1.5 text-2xs font-medium tracking-wide text-faint uppercase">
                {group}
              </h3>
              <dl className="space-y-1">
                {commands
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-4">
                      <dt className="text-[13px]">{c.label}</dt>
                      <dd>
                        <Kbd>{displayKeys(c.keys!)}</Kbd>
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
