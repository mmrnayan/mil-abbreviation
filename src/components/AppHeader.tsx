"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Moon, Repeat, Settings, Sun } from "lucide-react";

const navigation = [
  { href: "/", label: "Converter" },
  { href: "/dictionary", label: "Dictionary" },
  // Rules tab hidden for now — restore when ready to expose it again.
  // { href: "/rules", label: "Rules" },
];

export function AppHeader() {
  const pathname = usePathname();
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
              {pathname.startsWith("/dictionary") ? "Dictionary" : pathname.startsWith("/about") ? "Settings" : "Abbreviation Converter"}
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
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar (native-app style navigation). */}
      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-forest-900 pb-[env(safe-area-inset-bottom)] lg:hidden dark:bg-forest-950"
      >
        <div className="mx-auto grid max-w-md grid-cols-3">
          {[
            { href: "/", label: "Converter", icon: Repeat },
            { href: "/dictionary", label: "Dictionary", icon: BookOpen },
            { href: "/about", label: "Settings", icon: Settings },
          ].map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-2 py-2 text-[11px] font-semibold ${
                  active ? "text-gold-300" : "text-forest-50/70"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
