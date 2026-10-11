import type { Metadata } from "next";
import { AboutContent } from "@/components/AboutContent";

export const metadata: Metadata = {
  title: "About",
  description: "About the local, dataset-driven Bangladesh Services Writing Assistant.",
};

export default function AboutPage() {
  return <AboutContent />;
}
