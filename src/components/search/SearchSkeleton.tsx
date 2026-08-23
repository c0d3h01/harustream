const SKELETON_KEYS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

export function SearchSkeleton() {
  return (
    <div role="status" aria-label="Loading search results" className="mt-10">
      <div className="mb-5 h-8 w-56 animate-pulse rounded-lg bg-secondary" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="aspect-[2/3] animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}
