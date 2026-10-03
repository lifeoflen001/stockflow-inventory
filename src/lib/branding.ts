import logoUrl from "@/assets/neatnest-lotus-logo.png";

export const BRAND_LOGO_URL = logoUrl;
export const BRAND_LOGO_LIGHT_URL = logoUrl;
export const BRAND_LOGO_TRANSPARENT_URL = logoUrl;
export const BRAND_MARK_URL = "/neatnest-lotus-mark.svg";
export const BRAND_MARK_LIGHT_URL = "/neatnest-lotus-mark.svg";

export async function loadBrandLogoDataUrl() {
  const response = await fetch(BRAND_LOGO_TRANSPARENT_URL);
  if (!response.ok) throw new Error(`Unable to load brand logo (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:image/png;base64,${window.btoa(binary)}`;
}
