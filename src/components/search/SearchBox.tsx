'use client';

import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SPRING } from '@/components/motion/transitions';
import { useT } from '@/lib/i18n';

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  // The query we last wrote to the URL ourselves. When the server echoes it
  // back (initialQuery matches pushedRef) we MUST NOT copy it into state:
  // echoing clobbers everything typed since the push — the "input freezes
  // and undoes itself" bug. Only adopt values that arrived externally
  // (back/forward navigation, header-search submits).
  const pushedRef = useRef(initialQuery);

  // Adopt external URL changes only.
  useEffect(() => {
    if (initialQuery === pushedRef.current) return;
    pushedRef.current = initialQuery;
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      if (next === pushedRef.current.trim()) return;
      pushedRef.current = next;
      router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, {
        scroll: false,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [pathname, query, router]);

  const applyQuery = (next: string) => {
    pushedRef.current = next;
    setQuery(next);
    router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, {
      scroll: false,
    });
  };

  return (
    <search>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          applyQuery(query.trim());
        }}
        className="relative"
      >
        <label htmlFor="title-search" className="sr-only">
          {t('search.searchLabel')}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="title-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.searchPlaceholder')}
          autoComplete="off"
          enterKeyHint="search"
          className="glass-input h-14 w-full rounded-2xl px-12 pr-12 text-base outline-none transition-all duration-200 placeholder:text-muted-foreground hover:border-[var(--glass-border-strong)] focus:border-primary focus:ring-2 focus:ring-primary/20 active:scale-[0.995] [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Clear appears/disappears on typing — pop in/out, tap shrinks. */}
        <AnimatePresence>
          {query && (
            <motion.button
              key="clear"
              type="button"
              onClick={() => applyQuery('')}
              aria-label={t('search.clearSearch')}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              whileTap={{ scale: 0.8 }}
              transition={SPRING}
              className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      </form>
    </search>
  );
}
