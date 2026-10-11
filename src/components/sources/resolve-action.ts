'use server';

import type { ScoredCandidate } from '@/services/resolve';
import { resolveTitle } from '@/services/resolve';

export async function resolveTitleAction(
  title: string,
  originalTitle?: string,
  year?: string,
): Promise<{ best: ScoredCandidate | null; candidates: ScoredCandidate[] }> {
  return resolveTitle(title, originalTitle, year);
}
