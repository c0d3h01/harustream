import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { CandidateList } from '@/components/sources/CandidateList';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { ConfigNotice } from '@/components/ui/ConfigNotice';
import { asAppError } from '@/lib/errors';
import { scopeLogger } from '@/lib/log';
import { imgUrl } from '@/lib/media';
import { resolveTitle } from '@/services/resolve';
import { getDetails, type TmdbKind } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ kind: string; id: string }> };

export default async function FindPage({ params }: Props) {
  const { kind, id } = await params;
  if (kind !== 'movie' && kind !== 'tv') notFound();
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();
  const tmdbKind: TmdbKind = kind;

  let detail: Awaited<ReturnType<typeof getDetails>>;
  try {
    detail = await getDetails(tmdbKind, tmdbId);
  } catch (error) {
    // Only the catalogue decides whether this page can render. A provider
    // failure further down must not masquerade as a broken catalogue.
    if (asAppError(error).code === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <DirectionalTransition>
          <ConfigNotice error={error} />
        </DirectionalTransition>
      </Shell>
    );
  }

  // Scoring needs the title, so metadata resolves first. Provider downtime is an
  // empty source list, not an error page.
  const resolved = await resolveTitle(detail.title, detail.originalTitle, detail.year).catch(
    (error) => {
      scopeLogger('providers').warn({ detail: String(error) }, 'source resolve failed');
      return { best: null, candidates: [] };
    },
  );

  return (
    <Shell>
      <DirectionalTransition>
        <div className="content-gutter pt-8 sm:pt-14">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {detail.posterPath ? (
              <Image
                src={imgUrl(tmdbImageUrl(detail.posterPath, 'w342'))}
                alt=""
                width={140}
                height={210}
                className="h-auto w-24 shrink-0 rounded-lg object-cover sm:w-28"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-3xl leading-[1.05] tracking-[-0.02em] text-balance sm:text-4xl">
                {detail.title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {detail.year ? `${detail.year} · ` : ''}
                {resolved.candidates.length === 0
                  ? 'No source found'
                  : `${resolved.candidates.length} ${resolved.candidates.length === 1 ? 'source' : 'sources'} available`}
              </p>
            </div>
          </div>

          <div className="mt-8 max-w-3xl">
            <CandidateList
              candidates={resolved.candidates}
              best={resolved.best}
              tmdb={{ kind: tmdbKind, id: tmdbId }}
              fallbackPosterUrl={tmdbImageUrl(detail.posterPath, 'w342')}
            />
          </div>
        </div>
      </DirectionalTransition>
    </Shell>
  );
}
