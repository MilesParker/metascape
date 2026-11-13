// SPDX-License-Identifier: EPL-2.0
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { Boxes, CornerDownLeft, Search } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { familyOf, manifest } from '../catalog';
import { allCommands, displayKeys, useCommandStore } from '../lib/commands';
import { Dialog, DialogContent, DialogTitle, Kbd } from '../ui/primitives';
import { useShell } from './shell-state';

/** ⌘K: every action of the current page, then every model in the catalogue. */
export function CommandPalette(): ReactElement {
  const open = useShell((state) => state.palette);
  const setOpen = useShell((state) => state.setPalette);
  const sources = useCommandStore((state) => state.sources);
  const navigate = useNavigate();
  const commands = useMemo(
    () => allCommands(sources).filter((c) => !c.hidden && c.enabled !== false),
    [sources],
  );
  const groups = [...new Set(commands.map((c) => c.group))];
  const item =
    'flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-fg data-[selected=true]:bg-accent-soft [&_svg]:size-4 [&_svg]:text-muted';
  const heading =
    '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Commands and models</DialogTitle>
        <Command label="Commands and models" loop>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 text-faint" />
            <Command.Input
              autoFocus
              placeholder="Command or model"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[min(60vh,440px)] overflow-auto p-1.5 scrollbar-thin">
            <Command.Empty className="px-3 py-8 text-center text-muted">
              Nothing matches.
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group} heading={group} className={heading}>
                {commands
                  .filter((c) => c.group === group)
                  .map((command) => (
                    <Command.Item
                      key={command.id}
                      value={`${command.label} ${command.keywords ?? ''} ${command.id}`}
                      onSelect={() => {
                        setOpen(false);
                        command.run();
                      }}
                      className={item}
                    >
                      <span className="flex-1">{command.label}</span>
                      {command.keys && <Kbd>{displayKeys(command.keys)}</Kbd>}
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
            <Command.Group heading="Models" className={heading}>
              {manifest.models.map((model) => (
                <Command.Item
                  key={model.id}
                  value={`${model.name} ${familyOf(model).name} ${model.tags.join(' ')} ${model.id}`}
                  onSelect={() => {
                    setOpen(false);
                    void navigate({
                      to: '/models/$modelId',
                      params: { modelId: model.id },
                      search: {},
                    });
                  }}
                  className={item}
                >
                  <Boxes />
                  <span className="min-w-0 flex-1 truncate">{model.name}</span>
                  <span className="hidden text-2xs text-faint sm:inline">
                    {familyOf(model).collection}
                  </span>
                  <CornerDownLeft className="opacity-0 [[data-selected=true]_&]:opacity-100" />
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
