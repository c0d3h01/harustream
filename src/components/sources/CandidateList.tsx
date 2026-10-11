'use client';

import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { imgUrl } from '@/lib/media';
import { watchHref } from '@/lib/routes';
import type { ScoredCandidate } from '@/services/resolve';

export interface CandidateTmdb {
  kind: 'movie' | 'tv';
  id: number;
}

interface CandidateListProps {
  candidates: ScoredCandidate[];
  best: ScoredCandidate | null;
  tmdb: CandidateTmdb;
  fallbackPosterUrl?: string;
  onPlay?: (candidate: ScoredCandidate) => void;
}

function candidateHref(candidate: ScoredCandidate, tmdb: CandidateTmdb): string {
  return `${watchHref(candidate.providerId, candidate.ref)}?tmdbKind=${tmdb.kind}&tmdbId=${tmdb.id}`;
}

function CandidateRow({
  candidate,
  isBest,
  thumb,
  href,
  onPlay,
}: {
  candidate: ScoredCandidate;
  isBest: boolean;
  thumb: string;
  href: string;
  onPlay?: (candidate: ScoredCandidate) => void;
}) {
  const label = `Play ${candidate.displayTitle} on ${candidate.providerName}`;
  const className =
    'flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-200 hover:border-border hover:bg-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const body = (
    <>
      {thumb ? (
        <Image
          src={thumb}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="size-12 shrink-0 rounded-md bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{candidate.providerName}</span>
          {isBest ? (
            <span className="rounded-full bg-pastel-green px-2 py-0.5 text-[11px] font-medium text-pastel-green-fg">
              {'Best match'}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm font-medium">{candidate.displayTitle}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  if (onPlay) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onPlay(candidate)}
          aria-label={label}
          className={className}
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li>
      <Link href={href} aria-label={label} className={className}>
        {body}
      </Link>
    </li>
  );
}

export function CandidateList({
  candidates,
  best,
  tmdb,
  fallbackPosterUrl,
  onPlay,
}: CandidateListProps) {
  if (candidates.length === 0) {
    return (
      <p className="rounded-lg border border-border px-4 py-5 text-center text-sm text-muted-foreground">
        {'No provider has this title yet'}
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label={'Choose a source'}>
      {candidates.map((candidate) => (
        <CandidateRow
          key={`${candidate.providerId}:${candidate.ref}`}
          candidate={candidate}
          isBest={best?.providerId === candidate.providerId && best?.ref === candidate.ref}
          thumb={imgUrl(candidate.posterUrl ?? fallbackPosterUrl)}
          href={candidateHref(candidate, tmdb)}
          onPlay={onPlay}
        />
      ))}
    </ul>
  );
}
