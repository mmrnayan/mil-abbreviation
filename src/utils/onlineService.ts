import { Capacitor } from "@capacitor/core";
export class DeliveryConfigurationError extends Error {}
/** Fixed at build time for native bundles. An empty origin uses the website's collector. */
export function serviceUrl(path: string): string {
  const origin = process.env.NEXT_PUBLIC_SERVICE_ORIGIN?.replace(/\/$/u, "");
  if (origin) return origin + path;
  if (Capacitor.isNativePlatform() || (typeof window !== "undefined" && !["http:", "https:"].includes(window.location.protocol))) throw new DeliveryConfigurationError("Online delivery is not configured for this installer. Reports can be exported from Settings.");
  return path;
}
