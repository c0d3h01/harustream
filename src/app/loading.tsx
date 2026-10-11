export default function Loading() {
  return (
    <div aria-hidden="true">
      <div className="h-14 sm:h-16" />
      <div className="min-h-[92svh] rounded-lg border border-border bg-card" />
      <div className="content-gutter mt-10">
        <div className="h-64 rounded-lg border border-border bg-card" />
      </div>
    </div>
  );
}
