import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import type { Episode } from '@/types';

type EpisodeGridProps = {
  loading: boolean;
  error: string | null;
  episodes: Episode[];
  selectedId?: string;
  onSelect: (episode: Episode) => void;
};

/** Episode picker for series titles, with loading / error / empty states. */
export function EpisodeGrid({ loading, error, episodes, selectedId, onSelect }: EpisodeGridProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title.episodes')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('title.loadingEpisodes')}</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : episodes.length ? (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 scrollbar-thin sm:grid-cols-4">
            {episodes.map((entry) => (
              <Button
                key={entry.id}
                variant="outline"
                aria-pressed={entry.id === selectedId}
                onClick={() => onSelect(entry)}
                className={`h-10 rounded-lg px-2.5 text-xs font-medium ${
                  entry.id === selectedId ? 'border-primary bg-primary/10 text-primary' : ''
                }`}
              >
                {entry.title}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('title.noEpisodes')}</p>
        )}
      </CardContent>
    </Card>
  );
}
