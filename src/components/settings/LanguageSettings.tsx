'use client';

import { motion } from 'motion/react';
import { SPRING } from '@/components/motion/transitions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type LanguagePreference, LOCALE_LABELS, LOCALES, useLocale } from '@/lib/i18n';

/** Language picker: follow the browser by default, or pin one locale.
 *  The choice persists in a first-party cookie so the next server render
 *  comes back in the same language.
 *
 *  Interaction motion: the selected ring glides between choices via
 *  `layoutId`, taps shrink via `whileTap`. No render entrance.
 */
const CHOICES = ['auto', ...LOCALES] as const satisfies readonly LanguagePreference[];

type Choice = (typeof CHOICES)[number];

function labelFor(choice: Choice, autoLabel: string): string {
  return choice === 'auto' ? autoLabel : LOCALE_LABELS[choice];
}

export function LanguageSettings() {
  const { preference, setPreference, t } = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.language')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHOICES.map((choice) => {
            const selected = preference === choice;
            return (
              <motion.span
                key={choice}
                whileTap={{ scale: 0.94 }}
                transition={SPRING}
                className="relative flex"
              >
                {selected && (
                  <motion.span
                    layoutId="language-selected-ring"
                    transition={SPRING}
                    className="absolute inset-0 rounded-xl border-2 border-primary bg-primary/10"
                    aria-hidden="true"
                  />
                )}
                <Button
                  variant="outline"
                  aria-pressed={selected}
                  onClick={() => setPreference(choice)}
                  className={`relative h-12 w-full rounded-xl border-transparent bg-transparent px-3 transition-colors duration-200 ${
                    selected ? 'text-primary' : ''
                  }`}
                >
                  {labelFor(choice, t('settings.languageAuto'))}
                </Button>
              </motion.span>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t('settings.languageHint')}
        </p>
      </CardContent>
    </Card>
  );
}
