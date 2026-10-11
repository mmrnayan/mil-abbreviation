import type { Metadata } from "next";
import { RulesContent } from "@/components/RulesContent";

export const metadata: Metadata = {
  title: "Conversion Rules",
  description: "Dataset-defined conversion pipeline, contextual templates, scope and reverse-conversion policy.",
};

export default function RulesPage() {
  return <RulesContent />;
}
