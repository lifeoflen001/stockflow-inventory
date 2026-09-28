import {
  BRAND_LOGO_LIGHT_URL,
  BRAND_LOGO_URL,
  BRAND_MARK_LIGHT_URL,
  BRAND_MARK_URL,
} from "@/lib/branding.ts";
import { cn } from "@/lib/utils.ts";

export function BrandLogo({ className, alt = "Tanzania Specialist", darkSurface = false }: { className?: string; alt?: string; darkSurface?: boolean }) {
  return <picture className={cn("block", className)}><img src={BRAND_LOGO_URL} alt={alt} className={cn("h-full w-full object-contain", darkSurface ? "block" : "hidden dark:block")} /><img src={BRAND_LOGO_LIGHT_URL} alt="" aria-hidden="true" className={cn("h-full w-full object-contain", darkSurface ? "hidden" : "block dark:hidden")} /></picture>;
}

export function BrandMark({ className, alt = "Tanzania Specialist", darkSurface = false }: { className?: string; alt?: string; darkSurface?: boolean }) {
  return <span className={cn("relative block overflow-hidden", className)} aria-label={alt} role="img"><img src={BRAND_MARK_URL} alt="" className={cn("absolute right-0 top-0 h-full w-auto max-w-none object-contain", darkSurface ? "block" : "hidden dark:block")} /><img src={BRAND_MARK_LIGHT_URL} alt="" aria-hidden="true" className={cn("absolute right-0 top-0 h-full w-auto max-w-none object-contain", darkSurface ? "hidden" : "block dark:hidden")} /></span>;
}
