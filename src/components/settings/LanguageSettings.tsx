'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type LanguagePreference, LOCALE_LABELS, LOCALES, useLocale } from '@/lib/i18n';

const CHOICES = ['auto', ...LOCALES] as const satisfies readonly LanguagePreference[];

type Choice = (typeof CHOICES)[number];

function labelFor(choice: Choice, autoLabel: string): string {
  return choice === 'auto' ? autoLabel : LOCALE_LABELS[choice];
}

/** Language picker: follow the browser by default, or pin one locale.
 *  The choice persists in a first-party cookie so the next server render
 *  comes back in the same language. */
export function LanguageSettings() {
  const { preference, setPreference, t } = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.language')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHOICES.map((choice) => (
            <Button
              key={choice}
              variant="outline"
              aria-pressed={preference === choice}
              onClick={() => setPreference(choice)}
              className={`h-12 w-full rounded-xl px-3 ${
                preference === choice ? 'border-primary bg-primary/10 text-primary' : ''
              }`}
            >
              {labelFor(choice, t('settings.languageAuto'))}
            </Button>
          ))}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t('settings.languageHint')}
        </p>
      </CardContent>
    </Card>
  );
}
