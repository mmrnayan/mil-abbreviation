import type { Metadata } from "next";
import { DictionaryTable } from "@/components/DictionaryTable";

export const metadata: Metadata = {
  title: "Dictionary",
  description: "Search all authorized full forms, abbreviations, variants and meanings in the bundled dataset.",
};

export default function DictionaryPage() {
  return <DictionaryTable />;
}
