'use client';

import { ALL_QUALITIES, THEMES, useSettings } from '@/lib/storage';

export function SettingsView() {
  const { settings, update, toggleExcludedQuality } = useSettings();
  return (
    <section className="mx-auto max-w-3xl pt-12 sm:pt-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Preferences</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        These preferences stay in your browser. Nothing here is sent to a server.
      </p>
      <div className="mt-8 space-y-4">
        <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <h2 className="font-semibold">Playback</h2>
          <label className="mt-5 flex items-center justify-between gap-4 text-sm">
            Default speed
            <select
              value={settings.defaultPlaybackRate}
              onChange={(event) => update({ defaultPlaybackRate: Number(event.target.value) })}
              className="rounded-lg border border-border bg-secondary px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 flex items-center justify-between gap-4 text-sm">
            Auto-advance episodes
            <input
              type="checkbox"
              checked={settings.autoAdvance}
              onChange={(event) => update({ autoAdvance: event.target.checked })}
              className="size-4 accent-primary"
            />
          </label>
        </section>
        <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <h2 className="font-semibold">Provider</h2>
          <label className="mt-5 flex items-center justify-between gap-4 text-sm">
            Library provider
            <select
              value={settings.provider}
              onChange={(event) => update({ provider: event.target.value })}
              className="max-w-[12rem] rounded-lg border border-border bg-secondary px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="movieBoxWeb">movieBoxWeb</option>
              <option value="Moviesmod">Moviesmod</option>
              <option value="anikoto">anikoto</option>
            </select>
          </label>
        </section>
        <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <h2 className="font-semibold">Appearance</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => update({ theme })}
                className={`rounded-xl border px-3 py-3 text-sm capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${settings.theme === theme ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 hover:bg-secondary'}`}
              >
                {theme}
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <h2 className="font-semibold">Excluded qualities</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {ALL_QUALITIES.map((quality) => (
              <button
                key={quality}
                type="button"
                onClick={() => toggleExcludedQuality(quality)}
                className={`rounded-full border px-3 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${settings.excludedQualities.includes(quality) ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 hover:bg-secondary'}`}
              >
                {quality}
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
