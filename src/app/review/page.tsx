import type { Metadata } from "next";
import { ReviewMode } from "@/components/ReviewMode";

export const metadata: Metadata = {
  title: "Correction review · Abbreviation Converter",
  description: "Review conversions against expected outputs and record structured corrections.",
};

export default function ReviewPage() {
  return <ReviewMode />;
}
