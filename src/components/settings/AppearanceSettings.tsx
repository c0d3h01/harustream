import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { THEMES, type Theme } from '@/lib/storage';

type AppearanceSettingsProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
};

/** Theme picker for the four dark color schemes. */
export function AppearanceSettings({ theme, onThemeChange }: AppearanceSettingsProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.appearance')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {THEMES.map((entry) => (
          <Button
            key={entry}
            variant="outline"
            aria-pressed={theme === entry}
            onClick={() => onThemeChange(entry)}
            className={`h-12 w-full rounded-xl px-3 capitalize ${
              theme === entry ? 'border-primary bg-primary/10 text-primary' : ''
            }`}
          >
            {entry}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
