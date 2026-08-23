import type { ProviderContext, SettingsField } from '../types';

export const getSettingsSchema = async ({
  providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> => [
  {
    key: 'anikoto_skipTimings',
    type: 'toggle',
    label: 'Skip Timings',
    description: 'Automatically enable intro and outro skip timestamps from Anikoto',
    defaultValue: true,
  },
];
