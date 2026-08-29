import { ChevronDown } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import type { MediaGroup } from '@/types';

interface SourceGroupPickerProps {
  groups: MediaGroup[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function SourceGroupPickerInner({ groups, selectedIndex, onSelect }: SourceGroupPickerProps) {
  const t = useT();

  const items = useMemo(
    () =>
      groups.map((entry, index) => (
        <Button
          key={entry.id}
          variant="outline"
          role="option"
          aria-selected={index === selectedIndex}
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
      )),
    [groups, selectedIndex, onSelect],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title.source')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2" role="listbox" aria-label={t('title.source')}>
          {items}
        </div>
      </CardContent>
    </Card>
  );
}

export const SourceGroupPicker = memo(SourceGroupPickerInner);