"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Menu, Moon, Sun, X } from "lucide-react";
import { useDataset } from "@/providers/DatasetProvider";

const navigation = [
  { href: "/", label: "Converter" },
  { href: "/dictionary", label: "Dictionary" },
  { href: "/rules", label: "Rules" },
  { href: "/history", label: "History" },
  { href: "/about", label: "About" },
];

export function AppHeader() {
  const pathname = usePathname();
  const dataset = useDataset();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("sac:theme");
    const selected =
      stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(selected);
    document.documentElement.classList.toggle("dark", selected);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

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
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gold-300/60 bg-white/5 font-display text-lg font-bold tracking-wide text-gold-200 shadow-inner">
              SA
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[17px] font-bold tracking-[.01em] sm:text-xl">
                Service Abbreviation Converter
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-medium tracking-wide text-forest-100/80 sm:text-xs">
                Bangladesh Services Writing Assistant
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
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
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2.5 text-forest-50 hover:bg-white/10"
              aria-label={dark ? "Use light mode" : "Use dark mode"}
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-lg p-2.5 text-forest-50 hover:bg-white/10"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-white/10 px-4 py-3 lg:hidden">
            <div className="mx-auto grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-5">
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
        )}
      </header>
    </>
  );
}
