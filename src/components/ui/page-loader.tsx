import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type LoaderVariant = "table" | "cards" | "detail" | "dashboard";

function LoaderBlock({ className }: { className?: string }) {
  return <Skeleton aria-hidden="true" className={cn("loader-block", className)} />;
}

function PageContentLoader({ variant = "table", className }: { variant?: LoaderVariant; className?: string }) {
  if (variant === "cards") {
    return <div role="status" aria-label="Loading page content" className={cn("space-y-4 p-4 pb-24 md:p-6 md:pb-6", className)}>
      <div className="flex items-center justify-between gap-4"><div className="space-y-2"><LoaderBlock className="h-6 w-44" /><LoaderBlock className="h-3 w-72 max-w-[60vw]" /></div><LoaderBlock className="h-9 w-28" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <LoaderBlock key={index} className="h-40" />)}</div>
    </div>;
  }

  if (variant === "detail") {
    return <div role="status" aria-label="Loading page content" className={cn("space-y-4 p-4 pb-24 md:p-6 md:pb-6", className)}>
      <LoaderBlock className="h-9 w-64" /><LoaderBlock className="h-3 w-96 max-w-[70vw]" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]"><LoaderBlock className="h-[420px]" /><LoaderBlock className="h-[420px]" /></div>
    </div>;
  }

  if (variant === "dashboard") {
    return <div role="status" aria-label="Loading page content" className={cn("space-y-4 p-4 pb-24 md:p-6 md:pb-6", className)}>
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div className="space-y-2"><LoaderBlock className="h-5 w-56" /><LoaderBlock className="h-3 w-96 max-w-[70vw]" /></div><div className="flex gap-2"><LoaderBlock className="h-9 w-28" /><LoaderBlock className="h-9 w-24" /></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <LoaderBlock key={index} className="h-24" />)}</div>
      <LoaderBlock className="h-28" /><LoaderBlock className="h-44" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]"><LoaderBlock className="h-72" /><LoaderBlock className="h-72" /></div>
      <div className="grid gap-4 xl:grid-cols-2"><LoaderBlock className="h-64" /><LoaderBlock className="h-64" /></div>
    </div>;
  }

  return <div role="status" aria-label="Loading page content" className={cn("space-y-4 p-4 pb-24 md:p-6 md:pb-6", className)}>
    <div className="flex items-center justify-between gap-4"><div className="space-y-2"><LoaderBlock className="h-6 w-48" /><LoaderBlock className="h-3 w-80 max-w-[60vw]" /></div><LoaderBlock className="h-9 w-28" /></div>
    <LoaderBlock className="h-12 w-full" />
    <div className="overflow-hidden rounded-xl border"><div className="grid grid-cols-4 gap-4 border-b px-4 py-3"><LoaderBlock className="h-3" /><LoaderBlock className="h-3" /><LoaderBlock className="h-3" /><LoaderBlock className="h-3" /></div><div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, row) => <div key={row} className="grid grid-cols-4 gap-4"><LoaderBlock className="h-8" /><LoaderBlock className="h-8" /><LoaderBlock className="h-8" /><LoaderBlock className="h-8" /></div>)}</div></div>
    <div className="flex justify-end gap-2"><LoaderBlock className="h-8 w-20" /><LoaderBlock className="h-8 w-20" /></div>
  </div>;
}

function PageTransitionLoader() {
  return <div role="status" aria-label="Loading page" className="page-transition-loader"><span className="page-transition-loader__label" aria-hidden="true" /></div>;
}

export { LoaderBlock, PageContentLoader, PageTransitionLoader };
