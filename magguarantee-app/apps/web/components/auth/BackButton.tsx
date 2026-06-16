'use client';

// Phase 9 §9.1 — small "back to login" link used on the forgot / change-password
// surfaces. Renders an <ArrowLeft> + label. Two modes:
//   * `href`     → a Next <Link> (e.g. "Wróć do logowania" → /login).
//   * `onClick`  → a <button> (e.g. the change-password "Wyloguj się" escape
//     hatch, which must run a logout side-effect rather than navigate).
//
// Centered, muted text that brightens on hover. Matches the verify screen's
// back-link styling so the auth chrome stays consistent.

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface BackButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const baseClass =
  'inline-flex items-center gap-1.5 text-[13px] text-text-sub hover:text-text transition-colors focus-visible:outline-none focus-visible:text-text disabled:opacity-60 disabled:cursor-not-allowed';

export function BackButton({
  children,
  href,
  onClick,
  className,
  disabled,
}: BackButtonProps) {
  const content = (
    <>
      <ArrowLeft size={14} aria-hidden />
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(baseClass, className)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(baseClass, className)}
    >
      {content}
    </button>
  );
}
