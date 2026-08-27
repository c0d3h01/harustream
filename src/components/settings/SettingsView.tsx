'use client';

import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { LanguageSettings } from '@/components/settings/LanguageSettings';
import { PlaybackSettings } from '@/components/settings/PlaybackSettings';
import { ProviderSettings } from '@/components/settings/ProviderSettings';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/storage';

/** Orchestrates the persisted settings state and composes the settings
 *  panels. Rendering lives in PlaybackSettings / ProviderSettings /
 *  AppearanceSettings / LanguageSettings. */
export function SettingsView() {
  const { settings, update } = useSettings();
  const t = useT();
  return (
    <section className="mx-auto max-w-3xl pt-12 sm:pt-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        {t('settings.eyebrow')}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{t('settings.heading')}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('settings.description')}</p>
      <div className="mt-8 space-y-4">
        <PlaybackSettings
          autoAdvance={settings.autoAdvance}
          onAutoAdvanceChange={(enabled) => update({ autoAdvance: enabled })}
        />
        <LanguageSettings />
        <AppearanceSettings theme={settings.theme} onThemeChange={(theme) => update({ theme })} />
        <ProviderSettings
          provider={settings.provider}
          onProviderChange={(provider) => update({ provider })}
        />
      </div>
    </section>
  );
}
