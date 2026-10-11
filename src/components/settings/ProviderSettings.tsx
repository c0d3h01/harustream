import { useEffect } from 'react';
import { providerRegistry } from '@/providers/registry';

type ProviderSettingsProps = {
  provider: string;
  onProviderChange: (provider: string) => void;
};

const providerIds = Object.keys(providerRegistry);

export function ProviderSettings({ provider, onProviderChange }: ProviderSettingsProps) {
  useEffect(() => {
    if (!providerIds.includes(provider)) onProviderChange(providerIds[0] ?? '');
  }, [provider, onProviderChange]);
  return (
    <div className="pb-6">
      <p className="pt-7 font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
        {'Provider'}
      </p>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-6">
        <span className="text-sm font-medium">{'Library provider'}</span>
        <select
          value={providerIds.includes(provider) ? provider : (providerIds[0] ?? '')}
          onChange={(event) => onProviderChange(event.target.value)}
          className="max-w-48 rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {providerIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
