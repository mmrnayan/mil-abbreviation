import type { Metadata } from "next";
import { DiagnosticsContent } from "@/components/DiagnosticsContent";

export const metadata: Metadata = {
  title: "Diagnostics",
  description: "Dataset validation status and diagnostic information.",
};

export default function DiagnosticsPage() {
  return <DiagnosticsContent />;
}
