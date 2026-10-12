import { Capacitor } from "@capacitor/core";
export class DeliveryConfigurationError extends Error {}
/**
 * Fixed at build time for native bundles. An empty origin uses the website's collector.
 * The deploy platform (e.g. Vercel) injects the bound service URL as CONVERTER_URL /
 * NEXT_PUBLIC_CONVERTER_URL; NEXT_PUBLIC_SERVICE_ORIGIN remains as a legacy alias.
 */
const configuredOrigin = (process.env.NEXT_PUBLIC_CONVERTER_URL ?? process.env.NEXT_PUBLIC_SERVICE_ORIGIN ?? "").replace(/\/$/u, "");
if (configuredOrigin && !/^https:\/\/[^/]+$/u.test(configuredOrigin)) throw new DeliveryConfigurationError("Converter service URL must be an HTTPS origin without a path.");
export function serviceUrl(path: string): string {
  if (configuredOrigin) return configuredOrigin + path;
  if (Capacitor.isNativePlatform() || (typeof window !== "undefined" && !["http:", "https:"].includes(window.location.protocol))) throw new DeliveryConfigurationError("Online delivery is not configured for this installer. Reports can be exported from Settings.");
  return path;
}
