import type { ProviderContext, SettingsField } from '../_shared';

export const getSettingsSchema = async ({
  ctx,
}: {
  ctx: ProviderContext;
}): Promise<SettingsField[]> => [
  {
    key: 'anikoto_skipTimings',
    type: 'toggle',
    label: 'Skip Timings',
    description: 'Automatically enable intro and outro skip timestamps from Anikoto',
    defaultValue: true,
  },
];
