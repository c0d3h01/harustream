'use client';

import { Bookmark, Home, Search, Settings } from 'lucide-react';
import type { View } from '@/lib/state/reducer';
import { cn } from '@/lib/utils';

type Props = {
  view: View;
  libraryCount: number;
  onSetView: (view: View) => void;
  /** Open the mobile search input AND switch to the search view. Wired
   *  separately from `onSetView('search')` because the latter alone
   *  would just show the (empty) results view with no way to type. */
  onOpenSearch: () => void;
};

// BottomNav replaces the top-bar nav on small viewports. Each item is a
// 56dp touch target so it works comfortably on Android with the system
// gesture bar. The `pb-safe` padding above keeps the bar above the home
// indicator on iOS / the gesture pill on Android 10+.

export function MobileNav({ view, libraryCount, onSetView, onOpenSearch }: Props) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-safe backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5">
        <NavItem
          active={view === 'home'}
          onClick={() => onSetView('home')}
          icon={<Home className="size-5" />}
          label="Browse"
        />
        <NavItem
          active={view === 'search'}
          onClick={onOpenSearch}
          icon={<Search className="size-5" />}
          label="Search"
        />
        <NavItem
          active={view === 'library'}
          onClick={() => onSetView('library')}
          icon={<Bookmark className="size-5" />}
          label="My list"
          badge={libraryCount > 0}
        />
        <NavItem
          active={view === 'settings'}
          onClick={() => onSetView('settings')}
          icon={<Settings className="size-5" />}
          label="Settings"
        />
      </ul>
    </nav>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'touch-target relative flex w-full flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="relative">
          {icon}
          {badge && (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
          )}
        </span>
        {label}
      </button>
    </li>
  );
}
