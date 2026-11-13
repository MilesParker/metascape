// SPDX-License-Identifier: EPL-2.0
import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const variants = {
  default:
    'bg-raised text-fg border border-line hover:border-line-strong hover:bg-panel shadow-[0_1px_0_oklch(0_0_0/0.03)]',
  primary: 'bg-accent text-accent-fg border border-transparent hover:brightness-110',
  ghost: 'text-muted hover:text-fg hover:bg-accent-soft/60 border border-transparent',
  subtle: 'bg-panel text-fg border border-transparent hover:bg-line/60',
  warn: 'bg-warn-soft text-fg border border-warn/50 hover:border-warn',
} as const;

const sizes = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
  'icon-sm': 'h-7 w-7 justify-center',
  'icon-lg': 'h-11 w-11 justify-center',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: keyof typeof variants;
  readonly size?: keyof typeof sizes;
  readonly asChild?: boolean;
}

/** The one button: variants for emphasis, sizes for density. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', asChild = false, className, type, ...props },
  ref,
) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(
        'inline-flex shrink-0 select-none items-center rounded-md font-medium whitespace-nowrap transition-[background,border-color,color,filter] duration-100 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
