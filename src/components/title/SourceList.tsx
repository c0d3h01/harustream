import { AlertTriangle, Film, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import type { StreamSource } from '@/types';

type SourceListProps = {
  loading: boolean;
  error: string | null;
  sources: StreamSource[];
  onPlay: () => void;
};

/** Resolved stream sources for the selected group/episode. */
export function SourceList({ loading, error, sources, onPlay }: SourceListProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title.sources')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('title.resolving')}</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : sources.length ? (
          <ul className="space-y-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{source.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {source.quality ?? t('title.autoQuality')} · {source.format.toUpperCase()}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onPlay}
                  className="h-10 shrink-0 gap-1.5 px-3.5 text-xs font-semibold"
                >
                  <Play className="fill-current" aria-hidden="true" />
                  {t('title.play')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Film className="size-4 shrink-0" aria-hidden="true" />
            {t('title.selectSourcePrompt')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
