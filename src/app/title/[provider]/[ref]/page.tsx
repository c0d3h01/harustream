import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { TitleExperience } from '@/components/title/TitleExperience';
import { decodeRef } from '@/lib/refs';
import { media } from '@/services/media';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ provider: string; ref: string }> };

export default async function TitlePage({ params }: Props) {
  const { provider, ref: encodedRef } = await params;
  let item: Awaited<ReturnType<typeof media>>;
  try {
    item = await media(decodeURIComponent(provider), decodeRef(encodedRef));
  } catch {
    notFound();
  }
  return (
    <Shell>
      <div className="pt-12 sm:pt-16">
        <TitleExperience item={item} />
      </div>
    </Shell>
  );
}
