import { AlertTriangle } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import type { Episode } from '@/types';

interface EpisodeGridProps {
  loading: boolean;
  error: string | null;
  episodes: Episode[];
  selectedId?: string;
  onSelect: (episode: Episode) => void;
}

function EpisodeGridInner({ loading, error, episodes, selectedId, onSelect }: EpisodeGridProps) {
  const t = useT();

  const content = useMemo(() => {
    if (loading) {
      return (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {t('title.loadingEpisodes')}
        </p>
      );
    }
    if (error) {
      return (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }
    if (episodes.length === 0) {
      return <p className="text-sm text-muted-foreground">{t('title.noEpisodes')}</p>;
    }
    return (
      <div
        className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 scrollbar-thin sm:grid-cols-4"
        role="listbox"
        aria-label={t('title.episodes')}
      >
        {episodes.map((entry) => (
          <Button
            key={entry.id}
            variant="outline"
            role="option"
            aria-selected={entry.id === selectedId}
            onClick={() => onSelect(entry)}
            className={`h-10 rounded-lg px-2.5 text-xs font-medium ${
              entry.id === selectedId ? 'border-primary bg-primary/10 text-primary' : ''
            }`}
          >
            {entry.title}
          </Button>
        ))}
      </div>
    );
  }, [loading, error, episodes, selectedId, onSelect, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle id="episodes-title">{t('title.episodes')}</CardTitle>
      </CardHeader>
      <CardContent aria-labelledby="episodes-title">{content}</CardContent>
    </Card>
  );
}

export const EpisodeGrid = memo(EpisodeGridInner);
