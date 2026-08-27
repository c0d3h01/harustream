import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import type { MediaGroup } from '@/types';

type SourceGroupPickerProps = {
  groups: MediaGroup[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

/** Selects which source group (quality/variant) of the title to use. */
export function SourceGroupPicker({ groups, selectedIndex, onSelect }: SourceGroupPickerProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title.source')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.map((entry, index) => (
          <Button
            key={entry.id}
            variant="outline"
            aria-pressed={index === selectedIndex}
            onClick={() => onSelect(index)}
            className={`h-12 w-full justify-between px-3.5 text-left ${
              index === selectedIndex ? 'border-primary bg-primary/10 text-primary' : ''
            }`}
          >
            <span>{entry.label}</span>
            <ChevronDown
              className={`size-4 shrink-0 ${index === selectedIndex ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
