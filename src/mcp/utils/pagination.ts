export interface Page<T> {
  items: T[];
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset: number | undefined;
}

const MAX_LIMIT = 500;

/**
 * Slice a result list with a defensive limit/offset and emit pagination metadata.
 * `next_offset` is undefined on the last page so JSON consumers can detect end-of-stream.
 */
export function paginate<T>(items: readonly T[], limit: number, offset: number): Page<T> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
  const safeOffset = Math.max(0, Math.trunc(offset));
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  const end = safeOffset + slice.length;
  return {
    items: slice,
    total: items.length,
    count: slice.length,
    offset: safeOffset,
    has_more: end < items.length,
    next_offset: end < items.length ? end : undefined,
  };
}
