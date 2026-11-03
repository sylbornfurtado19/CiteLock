import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05020D] p-8 text-center">
      <p className="font-mono text-sm text-purple-400">404</p>
      <h1 className="text-xl font-bold text-[#F5F0FF]">Page not found</h1>
      <p className="max-w-sm text-sm text-[#B0A4C3]">That page does not exist, or it moved.</p>
      <Link
        href="/dashboard"
        className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-4 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-900/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
