export function ReportsLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
      <span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="text-sm">Loading reports…</span>
    </div>
  );
}
