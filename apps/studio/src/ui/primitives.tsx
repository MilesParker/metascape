// SPDX-License-Identifier: EPL-2.0
import {
  Dialog as D,
  DropdownMenu as M,
  Popover as P,
  Slider as S,
  Switch as W,
  Tabs as T,
  ToggleGroup as G,
  Tooltip as TT,
} from 'radix-ui';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { cn } from '../lib/cn';

/* Tooltip */

export const TooltipProvider = (props: ComponentProps<typeof TT.Provider>): ReactElement => (
  <TT.Provider delayDuration={350} skipDelayDuration={150} {...props} />
);

/** A short label shown on hover and focus; `keys` adds a shortcut hint. */
export function Tip({
  label,
  keys,
  side = 'top',
  children,
}: {
  readonly label: ReactNode;
  readonly keys?: string | undefined;
  readonly side?: 'top' | 'bottom' | 'left' | 'right';
  readonly children: ReactElement;
}): ReactElement {
  return (
    <TT.Root>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-50 flex max-w-72 items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-pop"
        >
          {label}
          {keys && <Kbd className="border-bg/30 bg-transparent text-bg/80">{keys}</Kbd>}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

/* Keyboard hint */

export function Kbd({ className, ...props }: ComponentProps<'kbd'>): ReactElement {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-panel px-1 font-mono text-[10px] font-medium text-muted',
        className,
      )}
      {...props}
    />
  );
}

/* Popover */

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof P.Content>): ReactElement {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-50 max-h-[var(--radix-popover-content-available-height)] overflow-auto rounded-lg border border-line bg-raised p-3 text-fg shadow-pop outline-none scrollbar-thin',
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

/* Dialog */

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export const DialogTitle = D.Title;
export const DialogDescription = D.Description;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof D.Content>): ReactElement {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          'fixed top-[12vh] left-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-line bg-raised text-fg shadow-pop outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}

/* Menu */

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({
  className,
  align = 'end',
  ...props
}: ComponentProps<typeof M.Content>): ReactElement {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-48 rounded-lg border border-line bg-raised p-1 text-fg shadow-pop',
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof M.Item>): ReactElement {
  return (
    <M.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent-soft [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof M.Label>): ReactElement {
  return (
    <M.Label
      className={cn(
        'px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-faint uppercase',
        className,
      )}
      {...props}
    />
  );
}

export const MenuSeparator = (): ReactElement => <M.Separator className="my-1 h-px bg-line" />;

/* Tabs */

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>): ReactElement {
  return <T.List className={cn('flex items-center gap-1', className)} {...props} />;
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof T.Trigger>): ReactElement {
  return (
    <T.Trigger
      className={cn(
        'relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-[0_0_0_1px_var(--line)]',
        className,
      )}
      {...props}
    />
  );
}

/* Switch */

export function Switch({ className, ...props }: ComponentProps<typeof W.Root>): ReactElement {
  return (
    <W.Root
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-line transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <W.Thumb className="block size-3 translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px]" />
    </W.Root>
  );
}

/* Slider */

/** A slider with one thumb, or two for a range; `marks` draws ticks (for example the default). */
export function Slider({
  className,
  marks,
  thumbLabels,
  ...props
}: ComponentProps<typeof S.Root> & {
  readonly marks?: readonly { value: number; label: string }[];
  readonly thumbLabels?: readonly string[];
}): ReactElement {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const count = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <S.Root
      className={cn(
        'relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-40',
        className,
      )}
      {...props}
    >
      <S.Track className="relative h-1 grow overflow-hidden rounded-full bg-line">
        <S.Range className="absolute h-full bg-accent/70" />
      </S.Track>
      {marks?.map((mark) => (
        <span
          key={mark.label}
          title={mark.label}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-muted"
          style={{ left: `${((mark.value - min) / (max - min || 1)) * 100}%` }}
        />
      ))}
      {Array.from({ length: count }, (_, i) => (
        <S.Thumb
          key={i}
          aria-label={thumbLabels?.[i]}
          className="block size-3.5 rounded-full border-2 border-accent bg-surface shadow transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
        />
      ))}
    </S.Root>
  );
}

/* Segmented control */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'sm',
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly { value: T; label: ReactNode; title?: string }[];
  readonly label: string;
  readonly className?: string;
  readonly size?: 'sm' | 'xs';
}): ReactElement {
  return (
    <G.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      className={cn('inline-flex rounded-md border border-line bg-panel p-0.5', className)}
    >
      {options.map((option) => (
        <G.Item
          key={option.value}
          value={option.value}
          title={option.title}
          className={cn(
            'inline-flex items-center gap-1 rounded-[5px] px-2 font-medium whitespace-nowrap text-muted transition-colors hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-[0_0_0_1px_var(--line)] [&_svg]:size-3.5',
            size === 'sm' ? 'h-6 text-xs' : 'h-5 text-2xs',
          )}
        >
          {option.label}
        </G.Item>
      ))}
    </G.Root>
  );
}

/* Small pieces */

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & {
  readonly tone?: 'neutral' | 'accent' | 'warn' | 'ok';
}): ReactElement {
  const tones = {
    neutral: 'border-line text-muted bg-panel',
    accent: 'border-accent/30 text-accent bg-accent-soft',
    warn: 'border-warn/40 text-fg bg-warn-soft',
    ok: 'border-ok/40 text-ok bg-ok/10',
  };
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-2xs font-medium whitespace-nowrap [&_svg]:size-3',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>): ReactElement {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint focus:border-accent focus:outline-none aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}
