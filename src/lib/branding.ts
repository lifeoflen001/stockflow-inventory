import logoUrl from "@/assets/logo4.png";
import lightLogoUrl from "@/assets/brand-logo.png";
import lightMarkUrl from "@/assets/brand-mark.png";

export const BRAND_LOGO_URL = logoUrl;
export const BRAND_LOGO_LIGHT_URL = lightLogoUrl;
export const BRAND_LOGO_TRANSPARENT_URL = logoUrl;
export const BRAND_MARK_URL = logoUrl;
export const BRAND_MARK_LIGHT_URL = lightMarkUrl;

export async function loadBrandLogoDataUrl() {
  const response = await fetch(BRAND_LOGO_TRANSPARENT_URL);
  if (!response.ok) throw new Error(`Unable to load brand logo (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:image/png;base64,${window.btoa(binary)}`;
}
