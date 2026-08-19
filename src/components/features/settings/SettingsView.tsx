'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Check,
  Database,
  Gauge,
  HardDrive,
  Info,
  MonitorPlay,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { memo, type ReactNode, useEffect, useState } from 'react';
import { SPRING, VIEWPORT } from '@/components/motion/transitions';
import { viewFadeUp } from '@/components/motion/variants';
import { PLAYBACK_RATES } from '@/lib/hooks/usePlaybackRate';
import { ALL_QUALITIES, THEMES, type Theme, type useSettings } from '@/lib/hooks/useSettings';
import type { Provider } from '@/lib/state/providers';
import { cn } from '@/lib/utils';

// Category navigation drives the scroll-spy on this view. Section ids must
// match the `id` on the matching <Section> so anchor jumps and the
// IntersectionObserver line up.
const SECTIONS = [
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'quality', label: 'Quality', icon: MonitorPlay },
  { id: 'provider', label: 'Provider', icon: Database },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'data', label: 'Data', icon: HardDrive },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// Real palette values mirroring the `:root[data-theme]` blocks in globals.css
// so the theme picker previews exactly what each theme looks like.
const THEME_PREVIEWS: Record<Theme, { bg: string; card: string; primary: string; border: string }> =
  {
    graphite: {
      bg: 'oklch(0.13 0.005 0)',
      card: 'oklch(0.18 0.005 0)',
      primary: 'oklch(0.8 0 0)',
      border: 'oklch(1 0 0 / 0.12)',
    },
    black: {
      bg: 'oklch(0 0 0)',
      card: 'oklch(0.13 0.015 260)',
      primary: 'oklch(0.8 0.16 190)',
      border: 'oklch(1 0 0 / 0.12)',
    },
    midnight: {
      bg: 'oklch(0.105 0.02 260)',
      card: 'oklch(0.155 0.025 260)',
      primary: 'oklch(0.7 0.19 265)',
      border: 'oklch(1 0 0 / 0.12)',
    },
    ocean: {
      bg: 'oklch(0.11 0.022 220)',
      card: 'oklch(0.16 0.022 220)',
      primary: 'oklch(0.82 0.14 195)',
      border: 'oklch(1 0 0 / 0.12)',
    },
  };

function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>('playback');

  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id) as SectionId[];
    let raf = 0;

    const update = () => {
      // The active category is the last section whose top has crossed the
      // 40% line. This is more forgiving than an IntersectionObserver band:
      // the final section can never reach the top of the viewport once the
      // page bottoms out, so a band would never select it.
      const line = window.innerHeight * 0.4;
      let current: SectionId = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    update();
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return active;
}

type Props = {
  settings: ReturnType<typeof useSettings>['settings'];
  update: ReturnType<typeof useSettings>['update'];
  toggleExcludedQuality: ReturnType<typeof useSettings>['toggleExcludedQuality'];
  providers: Provider[];
  providersLoading: boolean;
  providersRefreshing: boolean;
  providersError: string | null;
  refreshProviders: () => Promise<void>;
};

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      id={id}
      variants={viewFadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      className="mb-8 scroll-mt-28"
    >
      <div className="mb-3 flex items-center gap-3 px-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">{children}</div>
    </motion.section>
  );
}

function Row({ children, divider = true }: { children: ReactNode; divider?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-12 items-center justify-between gap-3 px-4 py-3',
        divider && 'border-b border-border/60',
      )}
    >
      {children}
    </div>
  );
}

function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        on ? 'bg-primary' : 'bg-muted',
      )}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 size-5 rounded-full bg-white shadow-xs"
        animate={{ x: on ? 20 : 0 }}
        transition={SPRING}
      />
    </button>
  );
}

export const SettingsView = memo(function SettingsView({
  settings,
  update,
  toggleExcludedQuality,
  providers,
  providersLoading,
  providersRefreshing,
  providersError,
  refreshProviders,
}: Props) {
  const [cleared, setCleared] = useState(false);
  const active = useActiveSection();

  const eraseAll = () => {
    if (typeof window === 'undefined') return;
    const prefix = 'harustream:';
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
    window.location.reload();
  };

  const clearProgress = () => {
    if (typeof window === 'undefined') return;
    const prefix = 'harustream:progress';
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
    setCleared(true);
    window.setTimeout(() => setCleared(false), 2000);
  };

  const live = !providersLoading && !providersError;
  const statusDot = providersLoading
    ? 'bg-amber-400'
    : providersError
      ? 'bg-destructive'
      : 'bg-emerald-400';
  const statusText = providersLoading
    ? 'Checking providers…'
    : providersError
      ? 'Providers unreachable'
      : `${providers.length} providers live`;

  return (
    <section className="py-6 pb-24 sm:py-10 sm:pb-28">
      <motion.div
        variants={viewFadeUp}
        initial="hidden"
        animate="visible"
        className="mb-8 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary sm:text-sm">
            Settings
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Preferences</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Tune playback, sources, and the look of your harustream.
          </p>
        </div>
        <div
          className={cn(
            'flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3.5 py-2 text-xs font-medium',
            providersError && 'text-destructive',
          )}
          role="status"
        >
          <span
            className={cn(
              'size-2 rounded-full',
              statusDot,
              live && 'shadow-[0_0_10px] shadow-emerald-400/50',
            )}
            aria-hidden="true"
          />
          {statusText}
        </div>
      </motion.div>

      <nav
        aria-label="Settings sections"
        className="sticky top-[var(--safe-top)] z-30 -mx-4 mb-8 bg-background/95 px-4 py-2.5 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8"
      >
        <div className="flex gap-1 overflow-x-auto">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const selected = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() =>
                  document
                    .getElementById(id)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  selected
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)] lg:items-start">
        <div className="min-w-0">
          <Section id="playback" icon={Play} title="Playback">
            <Row>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={Gauge} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Default playback speed</p>
                  <p className="text-xs text-muted-foreground">
                    Applied to every title until you change it in the player
                  </p>
                </div>
              </div>
            </Row>
            <fieldset className="min-w-0 border-b border-border/60 px-4 py-3">
              <legend className="sr-only">Default playback speed</legend>
              <div className="overflow-x-auto">
                <div className="inline-flex rounded-xl border border-border/70 bg-muted/40 p-1">
                  {PLAYBACK_RATES.map((r) => {
                    const selected = settings.defaultPlaybackRate === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => update({ defaultPlaybackRate: r })}
                        aria-pressed={selected}
                        className="relative touch-target rounded-lg px-4 py-1.5 text-xs font-semibold"
                      >
                        {selected && (
                          <motion.span
                            layoutId="speed-pill"
                            className="absolute inset-0 rounded-lg bg-foreground"
                            transition={SPRING}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={cn(
                            'relative z-10 transition-colors',
                            selected ? 'text-background' : 'text-muted-foreground',
                          )}
                        >
                          {r}x
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
            <Row divider={false}>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={Settings2} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Auto-advance episodes</p>
                  <p className="text-xs text-muted-foreground">
                    Start the next episode automatically when one ends
                  </p>
                </div>
              </div>
              <Toggle
                label="Auto-advance episodes"
                on={settings.autoAdvance}
                onChange={(next) => update({ autoAdvance: next })}
              />
            </Row>
          </Section>

          <Section
            id="quality"
            icon={MonitorPlay}
            title="Quality"
            description="Resolutions to hide"
          >
            <Row divider={false}>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={SlidersHorizontal} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Excluded qualities</p>
                  <p className="text-xs text-muted-foreground">
                    Hide these resolutions from the quality picker
                  </p>
                </div>
              </div>
            </Row>
            <div className="flex flex-wrap gap-2 px-4 pb-4 pt-1">
              {ALL_QUALITIES.map((q) => {
                const selected = settings.excludedQualities.includes(q);
                return (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleExcludedQuality(q)}
                    className={cn(
                      'touch-target flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/40 text-foreground hover:border-primary/40',
                    )}
                  >
                    {q}
                    {selected && <Check className="size-4" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            id="provider"
            icon={Database}
            title="Streaming provider"
            description="Tried first when sources are resolved"
          >
            <Row>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={Database} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Preferred source</p>
                  <p className="text-xs text-muted-foreground">
                    {providersLoading
                      ? 'Checking which providers are available…'
                      : providers.length > 0
                        ? `Live from the API — ${providers.length} available`
                        : 'The API could not be reached — no providers available'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshProviders()}
                disabled={providersRefreshing || providersLoading}
                aria-label="Refresh provider list"
                title="Refresh provider list"
                className="touch-target rounded-lg bg-muted p-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={cn('size-4', providersRefreshing && 'animate-spin')}
                  aria-hidden="true"
                />
              </button>
            </Row>
            <div className="flex flex-wrap gap-2 px-4 pb-4 pt-1">
              {providersLoading
                ? Array.from({ length: 6 }, (_, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: static, stateless skeleton placeholders.
                      key={i}
                      aria-hidden="true"
                      className="shimmer h-9 w-24 rounded-2xl bg-muted/60"
                    />
                  ))
                : providers.map((p) => {
                    const selected = settings.provider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => update({ provider: p.id })}
                        className={cn(
                          'touch-target flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/40 text-foreground hover:border-primary/40',
                        )}
                      >
                        {p.name}
                        {selected && <Check className="size-4" aria-hidden="true" />}
                      </button>
                    );
                  })}
            </div>
            {!providersLoading && providersError && (
              <p className="px-4 pb-4 text-xs text-muted-foreground">{providersError}</p>
            )}
          </Section>

          <Section
            id="appearance"
            icon={Palette}
            title="Appearance"
            description="Pick the look of the whole app"
          >
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {THEMES.map((t) => {
                  const selected = settings.theme === t;
                  const p = THEME_PREVIEWS[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => update({ theme: t })}
                      className={cn(
                        'group relative rounded-2xl border p-2 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border/70 bg-muted/20 hover:border-border hover:bg-muted/40',
                      )}
                    >
                      <span
                        className="relative block aspect-video w-full overflow-hidden rounded-xl"
                        style={{ background: p.bg }}
                        aria-hidden="true"
                      >
                        <span
                          className="absolute left-2 top-2 h-2 w-6 rounded-full"
                          style={{ background: p.primary }}
                        />
                        <span
                          className="absolute inset-x-2 bottom-2 top-5 rounded-lg"
                          style={{ background: p.card, border: `1px solid ${p.border}` }}
                        >
                          <span
                            className="absolute left-1.5 top-1.5 h-1 w-10 rounded-full"
                            style={{ background: p.primary }}
                          />
                          <span
                            className="absolute left-1.5 top-3.5 h-1 w-7 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.35)' }}
                          />
                          <span
                            className="absolute bottom-1.5 left-1.5 h-2 w-8 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.12)' }}
                          />
                          <span
                            className="absolute right-1.5 top-1.5 size-2 rounded-full"
                            style={{ background: p.primary }}
                          />
                        </span>
                      </span>
                      <span className="flex items-center gap-1 px-1 pb-1 pt-2 text-sm font-medium capitalize">
                        {t}
                        {selected && <Check className="size-4 text-primary" aria-hidden="true" />}
                      </span>
                      {selected && (
                        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <Row divider={false}>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={Save} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Your library</p>
                  <p className="text-xs text-muted-foreground">
                    Saved titles and watch progress live on this device
                  </p>
                </div>
              </div>
            </Row>
          </Section>

          <Section id="data" icon={HardDrive} title="Data">
            <Row>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={RotateCcw} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {cleared ? 'Watch progress cleared' : 'Clear watch progress'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Remove saved positions and the Continue-watching rail
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearProgress}
                className="touch-target rounded-lg bg-muted px-3 py-2 text-xs font-medium hover:bg-muted/80"
              >
                {cleared ? 'Done' : 'Clear'}
              </button>
            </Row>
            <Row divider={false}>
              <div className="flex min-w-0 items-center gap-3">
                <RowIcon icon={Trash2} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Erase all local data</p>
                  <p className="text-xs text-muted-foreground">
                    Clear library, progress, history, and preferences
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Erase all local data? This cannot be undone.')) {
                    eraseAll();
                  }
                }}
                className="touch-target rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20"
              >
                Erase
              </button>
            </Row>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
          <div className="rounded-3xl border border-border/70 bg-card/60 p-6">
            <div className="flex items-center gap-3">
              <Image
                src="/favicon/icon.png"
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-2xl"
              />
              <div>
                <p className="text-sm font-semibold tracking-tight">harustream</p>
                <p className="text-xs text-muted-foreground">Local-first streaming</p>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Source strategy
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">
                One catalog. Every provider.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Home browsing and search aggregate every live provider. Your preferred source only
                controls which provider is tried first when metadata or playback is resolved.
              </p>
            </div>
            <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    live && 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/50',
                  )}
                  aria-hidden="true"
                />
                {providersLoading ? 'Checking availability…' : `${providers.length} live providers`}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Refresh the source list whenever a provider is added or temporarily unavailable.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-3xl border border-border/70 bg-card/60 p-5 text-sm leading-5 text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>Streaming and metadata are provided by community-built provider sources.</p>
          </div>
        </aside>
      </div>
    </section>
  );
});
