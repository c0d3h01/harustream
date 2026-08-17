'use client';

import {
  Check,
  Database,
  Gauge,
  Info,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { memo, useState } from 'react';
import type { Provider } from '@/lib/api/providers';
import { PLAYBACK_RATES } from '@/lib/hooks/usePlaybackRate';
import { ALL_QUALITIES, THEMES, type useSettings } from '@/lib/hooks/useSettings';
import { cn } from '@/lib/utils';

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">{children}</div>
    </div>
  );
}

function Row({ children, divider = true }: { children: React.ReactNode; divider?: boolean }) {
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
        'relative h-7 w-12 shrink-0 rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-1 size-5 rounded-full bg-background shadow transition-all',
          on ? 'left-6' : 'left-1',
        )}
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

  return (
    <section className="py-6 sm:py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-primary sm:text-sm">
          Settings
        </p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Preferences</h1>
      </div>

      <div className="max-w-2xl">
        <Section title="Playback">
          <Row>
            <div className="flex min-w-0 items-center gap-3">
              <Gauge className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Default playback speed</p>
                <p className="text-xs text-muted-foreground">
                  Applied to every title until you change it in the player
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => update({ defaultPlaybackRate: r })}
                  aria-pressed={settings.defaultPlaybackRate === r}
                  className={cn(
                    'touch-target rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    settings.defaultPlaybackRate === r
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {r}x
                </button>
              ))}
            </div>
          </Row>
          <Row divider={false}>
            <div className="flex min-w-0 items-center gap-3">
              <Settings2 className="size-5 shrink-0 text-muted-foreground" />
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

        <Section title="Quality">
          <Row divider={false}>
            <div className="flex min-w-0 items-center gap-3">
              <SlidersHorizontal className="size-5 shrink-0 text-muted-foreground" />
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
                    'touch-target rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-foreground',
                  )}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Provider">
          <Row divider={false}>
            <div className="flex min-w-0 items-center gap-3">
              <Database className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Streaming provider</p>
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
                    className="h-9 w-24 animate-pulse rounded-2xl bg-muted/60"
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
                        'touch-target rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/40 text-foreground',
                      )}
                    >
                      {p.name}
                    </button>
                  );
                })}
          </div>
          {!providersLoading && providersError && (
            <p className="px-4 pb-4 text-xs text-muted-foreground">{providersError}</p>
          )}
        </Section>

        <Section title="Appearance">
          <Row>
            <div className="flex min-w-0 items-center gap-3">
              <Moon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground">Pick the look of the whole app</p>
              </div>
            </div>
          </Row>
          <Row divider={false}>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => {
                const selected = settings.theme === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ theme: t })}
                    className={cn(
                      'touch-target flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-full"
                      style={{
                        background:
                          t === 'black'
                            ? '#000'
                            : t === 'midnight'
                              ? '#23233a'
                              : t === 'graphite'
                                ? '#3f3f46'
                                : '#0e7490',
                        border: '1px solid rgba(255,255,255,0.25)',
                      }}
                    />
                    {t}
                    {selected && <Check className="size-4" />}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row divider={false}>
            <div className="flex min-w-0 items-center gap-3">
              <Save className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Your library</p>
                <p className="text-xs text-muted-foreground">
                  Saved titles and watch progress live on this device
                </p>
              </div>
            </div>
          </Row>
        </Section>

        <Section title="Data management">
          <Row>
            <div className="flex min-w-0 items-center gap-3">
              <RotateCcw className="size-5 shrink-0 text-muted-foreground" />
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
          <Row>
            <div className="flex min-w-0 items-center gap-3">
              <Trash2 className="size-5 shrink-0 text-muted-foreground" />
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

        <Section title="About">
          <Row divider={false}>
            <div className="flex min-w-0 items-center gap-3">
              <Info className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">harustream</p>
                <p className="text-xs text-muted-foreground">
                  Streaming and metadata are provided by community-built provider sources.
                </p>
              </div>
            </div>
          </Row>
        </Section>
      </div>
    </section>
  );
});
