'use client';

import { LanguageSettings } from '@/components/settings/LanguageSettings';
import { PlaybackSettings } from '@/components/settings/PlaybackSettings';
import { ProviderSettings } from '@/components/settings/ProviderSettings';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/storage';

/** Orchestrates the persisted settings state and composes the settings
 *  panels. Rendering lives in PlaybackSettings / ProviderSettings /
 *  LanguageSettings. */
export function SettingsView() {
  const { settings, update } = useSettings();
  const t = useT();
  return (
    <section className="mx-auto max-w-4xl pt-10 sm:pt-14">
      <div className="border-b border-border/60 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          {t('settings.eyebrow')}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">{t('settings.heading')}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {t('settings.description')}
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <PlaybackSettings
          autoAdvance={settings.autoAdvance}
          onAutoAdvanceChange={(enabled) => update({ autoAdvance: enabled })}
        />
        <LanguageSettings />
        <ProviderSettings
          provider={settings.provider}
          onProviderChange={(provider) => update({ provider })}
        />
      </div>
    </section>
  );
}
