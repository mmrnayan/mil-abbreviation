import type { Metadata } from "next";
import { HistoryContent } from "@/components/HistoryContent";

export const metadata: Metadata = {
  title: "History",
  description: "Review and export up to 50 locally stored conversions.",
};

export default function HistoryPage() {
  return <HistoryContent />;
}
