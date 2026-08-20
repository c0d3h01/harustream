'use client';

import { Bookmark, Home, Search, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { DURATIONS, EASE, SPRING } from '@/components/motion';
import type { View } from '@/lib/state/reducer';
import { cn } from '@/lib/utils';

type Props = {
  view: View;
  libraryCount: number;
  onSetView: (view: View) => void;
  /** Switch to the search view. The view's SearchBar autofocuses, so this is
   *  the single entry point for search on every screen size. */
  onOpenSearch: () => void;
};

type NavItem = {
  id: View | 'search';
  label: string;
  icon: ReactNode;
  active: boolean;
  onSelect: () => void;
  badge?: boolean;
};

const GITHUB_URL = 'https://github.com/harusharu/harustream';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function FloatingMenu({ view, libraryCount, onSetView, onOpenSearch }: Props) {
  const items: NavItem[] = [
    {
      id: 'home',
      label: 'Browse',
      icon: <Home className="size-4.5" />,
      active: view === 'home',
      onSelect: () => onSetView('home'),
    },
    {
      id: 'search',
      label: 'Search',
      icon: <Search className="size-4.5" />,
      active: view === 'search',
      onSelect: onOpenSearch,
    },
    {
      id: 'library',
      label: 'My list',
      icon: <Bookmark className="size-4.5" />,
      active: view === 'library',
      onSelect: () => onSetView('library'),
      badge: libraryCount > 0,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="size-4.5" />,
      active: view === 'settings',
      onSelect: () => onSetView('settings'),
    },
  ];

  return (
    // One dock for every screen size — phones, tablets, and desktops all use
    // the same horizontal dash dock. Sits clear of the home indicator via the
    // safe-area inset, and scrolls instead of clipping on very narrow phones.
    <nav
      aria-label="Primary"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-40 -translate-x-1/2"
    >
      <motion.ul
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATIONS.slow, ease: EASE }}
        className="scrollbar-none flex max-w-[calc(100vw-1.5rem)] items-end gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/95 px-1.5 pt-1 pb-1.5 shadow-2xl shadow-background/50 sm:gap-2 sm:px-2"
      >
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={item.onSelect}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'group flex flex-col items-center gap-0.5 rounded-xl px-2 pt-1.5 pb-0.5 transition hover:bg-secondary/70 sm:px-3',
                item.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <motion.span
                whileHover={{ scale: 1.18, y: -3 }}
                transition={SPRING}
                className={cn(
                  'relative grid size-8 place-items-center rounded-full transition-colors duration-200',
                  !item.active && 'bg-secondary',
                )}
              >
                {item.active && (
                  <motion.span
                    layoutId="dock-active-pill"
                    className="absolute inset-0 rounded-full bg-primary/15"
                    transition={SPRING}
                  />
                )}
                <span className="relative z-10 grid place-items-center">
                  {item.icon}
                  {item.badge && (
                    <span className="absolute top-0 right-0 size-2 rounded-full bg-primary" />
                  )}
                </span>
              </motion.span>
              <span className="text-[10px] font-medium tracking-wide sm:text-[11px]">
                {item.label}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'h-1 w-1 rounded-full transition-opacity duration-200',
                  item.active ? 'bg-primary opacity-100' : 'opacity-0 group-hover:opacity-40',
                )}
              />
            </button>
          </li>
        ))}

        <li aria-hidden="true" className="mx-0.5 h-7 w-px shrink-0 bg-border/60 sm:mx-1" />

        {/* GitHub — links out to the project repository in a new tab. */}
        <li className="shrink-0">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="group flex flex-col items-center gap-0.5 rounded-xl px-1.5 pt-1.5 pb-0.5 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden sm:px-3"
          >
            <motion.span
              whileHover={{ scale: 1.18, y: -3 }}
              transition={SPRING}
              className="relative grid size-8 place-items-center rounded-full bg-secondary transition-colors duration-200"
            >
              <GithubIcon className="size-4.5" />
            </motion.span>
            <span className="text-[10px] font-medium tracking-wide sm:text-[11px]">GitHub</span>
            <span className="h-1 w-1 opacity-0" aria-hidden="true" />
          </a>
        </li>
      </motion.ul>
    </nav>
  );
}
