import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { providerRegistry } from '@/providers/registry';

type ProviderSettingsProps = {
  provider: string;
  onProviderChange: (provider: string) => void;
};

const providerIds = Object.keys(providerRegistry);

/** Chooses which provider's catalog the library list reads from. */
export function ProviderSettings({ provider, onProviderChange }: ProviderSettingsProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.provider')}</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="flex items-center justify-between gap-4 text-sm">
          {t('settings.libraryProvider')}
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="max-w-48 rounded-lg border border-border bg-secondary px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {providerIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </CardContent>
    </Card>
  );
}
