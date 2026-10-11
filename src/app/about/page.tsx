import type { Metadata } from "next";
import { AboutContent } from "@/components/AboutContent";

export const metadata: Metadata = {
  title: "Settings",
  description: "About the authorized abbreviation converter based on the Joint Services Staff Duties Manual 2022.",
};

export default function AboutPage() {
  return <AboutContent />;
}
