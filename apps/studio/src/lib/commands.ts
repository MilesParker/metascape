// SPDX-License-Identifier: EPL-2.0
import { useEffect, useId, useRef, type RefObject } from 'react';
import { create } from 'zustand';

/**
 * One action of the Studio. The same list feeds the command palette, the
 * keyboard shortcuts and the shortcut help, so they never disagree.
 */
export interface Command {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  /** Shortcut, such as `space`, `shift+r`, `mod+k` or `?`. */
  readonly keys?: string;
  /** Extra words the palette matches. */
  readonly keywords?: string;
  readonly enabled?: boolean;
  /** Leave out of the palette (still a shortcut). */
  readonly hidden?: boolean;
  run(): void;
}

type Source = RefObject<readonly Command[]>;

interface CommandState {
  /** Changes whenever a source's commands change in name, shortcut or availability. */
  readonly sources: ReadonlyMap<string, Source>;
  setSource(id: string, commands: Source | undefined): void;
}

export const useCommandStore = create<CommandState>((set) => ({
  sources: new Map(),
  setSource: (id, commands) =>
    set((state) => {
      const sources = new Map(state.sources);
      if (commands) sources.set(id, commands);
      else sources.delete(id);
      return { sources };
    }),
}));

/** Every registered command, newest source first so a page can override the shell. */
export function allCommands(sources: ReadonlyMap<string, Source>): Command[] {
  const seen = new Set<string>();
  const list: Command[] = [];
  for (const source of [...sources.values()].reverse()) {
    for (const command of source.current) {
      if (seen.has(command.id)) continue;
      seen.add(command.id);
      list.push(command);
    }
  }
  return list;
}

/**
 * Registers commands while the calling component is mounted. Commands are
 * read when used, so their actions always see the latest state; the palette
 * refreshes when a command's label, shortcut or availability changes.
 */
export function useCommands(commands: readonly Command[]): void {
  const id = useId();
  const setSource = useCommandStore((state) => state.setSource);
  const latest = useRef(commands);
  const signature = commands
    .map((c) => `${c.id}|${c.label}|${String(c.enabled)}|${c.keys ?? ''}`)
    .join(';');
  useEffect(() => {
    latest.current = commands;
  });
  useEffect(() => {
    latest.current = commands;
    setSource(id, latest);
    // Re-register only when what people see changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, signature, setSource]);
  useEffect(() => () => setSource(id, undefined), [id, setSource]);
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as shown to people: `mod+k` becomes ⌘K on a Mac and Ctrl+K elsewhere. */
export function displayKeys(keys: string): string {
  return keys
    .split('+')
    .map((part) => {
      switch (part) {
        case 'mod':
          return isMac ? '⌘' : 'Ctrl+';
        case 'shift':
          return '⇧';
        case 'alt':
          return isMac ? '⌥' : 'Alt+';
        case 'space':
          return 'Space';
        case 'arrowright':
          return '→';
        case 'arrowleft':
          return '←';
        case 'escape':
          return 'Esc';
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join('');
}

/** Whether a key event is the given shortcut. */
export function matchesKeys(keys: string, event: KeyboardEvent): boolean {
  const parts = keys.toLowerCase().split('+');
  const key = parts[parts.length - 1]!;
  const mod = parts.includes('mod');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');
  if (mod !== (isMac ? event.metaKey : event.ctrlKey)) return false;
  if (alt !== event.altKey) return false;
  const pressed = event.key === ' ' ? 'space' : event.key.toLowerCase();
  // Shifted symbols such as `?` arrive already shifted; only check shift for letters and names.
  if (key.length === 1 && !/[a-z0-9]/.test(key)) return pressed === key;
  if (shift !== event.shiftKey) return false;
  return pressed === key;
}

const typing = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['checkbox', 'radio', 'range', 'button'].includes(type);
};

const isControl = (target: HTMLElement): boolean => {
  const role = target.getAttribute('role');
  return (
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.tagName === 'SUMMARY' ||
    (target.tagName === 'INPUT' &&
      ['checkbox', 'radio', 'range', 'button'].includes((target as HTMLInputElement).type)) ||
    role === 'slider' ||
    role === 'switch' ||
    role === 'tab' ||
    role === 'checkbox' ||
    role === 'menuitem' ||
    role === 'button'
  );
};

/** Whether the element was focused from the keyboard rather than by a click. */
function keyboardFocused(target: HTMLElement): boolean {
  try {
    return target.matches(':focus-visible');
  } catch {
    return true;
  }
}

/** Runs the matching command for each key press, unless the user is typing. */
export function useShortcuts(): void {
  const sources = useCommandStore((state) => state.sources);
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const inField = typing(event.target);
      for (const command of allCommands(sources)) {
        if (!command.keys || command.enabled === false) continue;
        if (!matchesKeys(command.keys, event)) continue;
        if (inField && !command.keys.includes('mod') && command.keys !== 'escape') continue;
        // Space belongs to a control reached with the keyboard. One that was
        // clicked only holds focus by accident: let go of it so the key
        // does not press it again, and play or pause instead.
        if (command.keys === 'space' && event.target instanceof HTMLElement) {
          const target = event.target;
          if (target !== document.body && isControl(target)) {
            if (keyboardFocused(target)) return;
            target.blur();
          }
        }
        event.preventDefault();
        command.run();
        return;
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [sources]);
}
