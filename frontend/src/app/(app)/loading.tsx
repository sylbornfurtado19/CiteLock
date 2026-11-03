import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Shown while a route inside the app is loading, so navigation never shows a blank page. */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2 border-b border-purple-900/20 pb-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3 rounded-2xl border border-purple-900/30 bg-[#100A1C]/60 p-6">
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
