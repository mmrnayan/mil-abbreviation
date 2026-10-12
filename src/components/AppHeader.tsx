"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Moon, Sun, Settings } from "lucide-react";
import { useDataset } from "@/providers/DatasetProvider";

const navigation = [
  { href: "/", label: "Converter" },
  { href: "/dictionary", label: "Dictionary" },
  // Rules tab hidden for now — restore when ready to expose it again.
  // { href: "/rules", label: "Rules" },
];

export function AppHeader() {
  const pathname = usePathname();
  const dataset = useDataset();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("sac:theme");
    const selected =
      stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(selected);
    document.documentElement.classList.toggle("dark", selected);
  }, []);


  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("sac:theme", next ? "dark" : "light");
  }

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-gold-300 px-4 py-2 font-semibold text-forest-950 focus:translate-y-0"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-50 border-b border-forest-950/10 bg-forest-900 text-white shadow-sm dark:border-white/10 dark:bg-forest-950">
        <div className="h-1 bg-gradient-to-r from-gold-700 via-gold-300 to-gold-700" />
        <div className="page-shell flex min-h-[76px] items-center justify-between gap-4 py-3">
          <Link href="/" className="group flex min-w-0 items-center gap-3 rounded-lg">
            <Image
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icons/army.png`}
              alt=""
              width={56}
              height={56}
              priority
              className="h-14 w-14 shrink-0 rounded-xl object-contain"
            />
            <span className="block truncate font-display text-[17px] font-bold tracking-[.01em] sm:text-2xl">
              Abbreviation Converter
            </span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            <Link href="/about" className="rounded-lg p-2.5 hover:bg-white/10" aria-label="Settings" title="Settings"><Settings className="h-5 w-5" /></Link>
            <nav aria-label="Primary navigation" className="flex items-center gap-0.5">
              {navigation.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      active
                        ? "bg-white/12 text-gold-200"
                        : "text-forest-50/90 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <span className="mx-2 h-6 w-px bg-white/15" />
            {dataset.status === "ready" && (
              <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold text-forest-100 xl:inline-flex">
                <CheckCircle2 className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
                Dataset verified
              </span>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2.5 text-forest-50 hover:bg-white/10"
              aria-label={dark ? "Use light mode" : "Use dark mode"}
              title={dark ? "Use light mode" : "Use dark mode"}
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center gap-1 lg:hidden">
            <Link href="/about" className="rounded-lg p-2.5 hover:bg-white/10" aria-label="Settings"><Settings className="h-5 w-5" /></Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2.5 text-forest-50 hover:bg-white/10"
              aria-label={dark ? "Use light mode" : "Use dark mode"}
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>

          <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-white/10 px-4 py-3 lg:hidden">
            <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
              {navigation.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2.5 text-center text-sm font-semibold ${
                      active ? "bg-gold-300 text-forest-950" : "bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
      </header>
    </>
  );
}
