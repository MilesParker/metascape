// SPDX-License-Identifier: EPL-2.0
import { Link } from '@tanstack/react-router';
import { Moon, Sun } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useTheme } from '../lib/theme';
import { Button } from '../ui/button';
import { Tip } from '../ui/primitives';
import { Logo } from './Logo';

/** The bar across the top of every page: the way home, the page's own items, and the theme. */
export function TopBar({
  children,
  actions,
  className,
}: {
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const toggleTheme = useTheme((state) => state.toggle);
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg px-3',
        className,
      )}
    >
      <Link
        to="/"
        search={{}}
        className="flex items-center gap-2 rounded-md pr-1 text-[13px] font-medium text-muted hover:text-fg"
      >
        <Logo className="size-6" />
        <span className="hidden sm:inline">Library</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div className="flex items-center gap-1">
        {actions}
        <Tip label="Light or dark" keys="T">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Light or dark">
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
        </Tip>
      </div>
    </header>
  );
}
