import {
  BRAND_LOGO_LIGHT_URL,
  BRAND_LOGO_URL,
  BRAND_MARK_LIGHT_URL,
  BRAND_MARK_URL,
} from "@/lib/branding.ts";
import { cn } from "@/lib/utils.ts";

export function BrandLogo({ className, alt = "NeatNest Organized Inventories", darkSurface = false }: { className?: string; alt?: string; darkSurface?: boolean }) {
  return <picture className={cn("block", className)}><img src={BRAND_LOGO_URL} alt={alt} className={cn("h-full w-full object-contain", darkSurface ? "block" : "hidden dark:block")} /><img src={BRAND_LOGO_LIGHT_URL} alt="" aria-hidden="true" className={cn("h-full w-full object-contain", darkSurface ? "hidden" : "block dark:hidden")} style={{ filter: "brightness(0) saturate(100%)" }} /></picture>;
}

export function BrandMark({ className, alt = "NeatNest lotus mark", darkSurface = false }: { className?: string; alt?: string; darkSurface?: boolean }) {
  return <span className={cn("relative block overflow-hidden", className)} aria-label={alt} role="img"><img src={BRAND_MARK_URL} alt="" className={cn("absolute inset-0 h-full w-full object-contain", darkSurface ? "block" : "hidden dark:block")} /><img src={BRAND_MARK_LIGHT_URL} alt="" aria-hidden="true" className={cn("absolute inset-0 h-full w-full object-contain", darkSurface ? "hidden" : "block dark:hidden")} style={{ filter: "brightness(0) saturate(100%)" }} /></span>;
}
