import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';

type PlaybackSettingsProps = {
  autoAdvance: boolean;
  onAutoAdvanceChange: (enabled: boolean) => void;
};

/** Playback preferences: whether the next episode starts on its own. */
export function PlaybackSettings({ autoAdvance, onAutoAdvanceChange }: PlaybackSettingsProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.playback')}</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="flex items-center justify-between gap-4 text-sm">
          {t('settings.autoPlayNext')}
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(event) => onAutoAdvanceChange(event.target.checked)}
            className="size-4 accent-primary"
          />
        </label>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t('settings.autoPlayNextHint')}
        </p>
      </CardContent>
    </Card>
  );
}
