'use client';

import { PlaybackSettings } from '@/components/settings/PlaybackSettings';
import { ProviderSettings } from '@/components/settings/ProviderSettings';
import { useSettings } from '@/lib/storage';

export function SettingsView() {
  const { settings, update } = useSettings();
  return (
    <section className="content-gutter pt-10 sm:pt-14">
      <div className="border-b border-border pb-8">
        <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {'Preferences'}
        </p>
        <h1 className="mt-2 font-heading text-4xl tracking-[-0.01em]">{'Settings'}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {'These preferences stay in your browser. Nothing here is sent to a server.'}
        </p>
      </div>
      <PlaybackSettings
        autoAdvance={settings.autoAdvance}
        onAutoAdvanceChange={(enabled) => update({ autoAdvance: enabled })}
      />
      <ProviderSettings
        provider={settings.provider || ''}
        onProviderChange={(provider) => update({ provider })}
      />
    </section>
  );
}
