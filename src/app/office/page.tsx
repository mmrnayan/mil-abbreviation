import Script from "next/script";
import { ConverterPanel } from "@/components/ConverterPanel";

export const metadata = { title: "Service Abbreviation Converter for Word" };

export default function OfficePage() {
  return (
    <>
      {/* Loaded here only: outside a Word host this script breaks window.history
          and takes the Next.js router down with it. */}
      <Script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js" />
      <ConverterPanel />
    </>
  );
}
