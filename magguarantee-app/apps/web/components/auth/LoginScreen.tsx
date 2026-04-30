// Full-screen wrapper for `/login` and `/login/verify`. Provides:
//   * MAGTRANS logo top-left (linking back to magtrans.eu).
//   * Two decorative radial-gradient ornaments (brand-coloured glow corners).
//   * Theme + language toggles in fixed corners.
//   * Centred card slot.
//
// All ornaments are `aria-hidden pointer-events-none` so they never trap
// focus or block clicks. Brand identity per docs/14-design-system.md
// section "Phase 1: login & verify components".

import Image from 'next/image';

import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function LoginScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg overflow-hidden px-4">
      {/* Brand logo top-left */}
      <a
        href="https://www.magtrans.eu"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-6 left-8 z-20 sm:top-4 sm:left-4 transition-opacity hover:opacity-80"
      >
        <Image
          src="/logo.svg"
          alt="MAGTRANS"
          width={240}
          height={64}
          priority
          className="h-13 sm:h-10 w-auto drop-shadow-sm dark:brightness-110"
        />
      </a>

      {/* Decorative radial ornaments */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-52 -right-24 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(220,38,38,0.12),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-36 -left-24 w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.05),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(220,38,38,0.08),transparent_70%)]"
      />

      {/* Top-right language toggle */}
      <div className="absolute top-6 right-6 z-20 sm:top-4 sm:right-4">
        <LanguageToggle />
      </div>

      {/* Bottom-right theme toggle */}
      <div className="absolute bottom-6 right-6 z-20 sm:bottom-4 sm:right-4">
        <ThemeToggle />
      </div>

      <main className="relative z-10 w-full max-w-[420px]">{children}</main>
    </div>
  );
}
