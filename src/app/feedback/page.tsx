import type { Metadata } from "next";
import { FeedbackReports } from "@/components/FeedbackReports";

export const metadata: Metadata = {
  title: "Issue reports · Abbreviation Converter",
  description: "Collected user issue reports stored on this server.",
  robots: { index: false, follow: false },
};

export default function FeedbackPage() {
  return <FeedbackReports />;
}
