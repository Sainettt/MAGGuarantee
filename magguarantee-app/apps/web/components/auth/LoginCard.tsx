// Branded login-card with a 4px MAGTRANS-RED top stripe — this is the brand
// anchor for the auth surface. Per design system: the stripe is
// non-negotiable. Inside: a Truck-emoji chip, the app name, and a subtitle
// that varies by step.

import { cn } from '@/lib/utils';

interface LoginCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}

export function LoginCard({
  title,
  subtitle,
  children,
  className,
}: LoginCardProps) {
  return (
    <div
      className={cn(
        'relative w-full max-w-[420px] mx-auto bg-card rounded-xl shadow-login dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
        // 4px MAGTRANS RED top stripe — brand anchor
        'border-t-4 border-brand',
        'px-10 py-12 sm:px-6 sm:py-10 max-sm:max-w-[92vw]',
        className,
      )}
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand text-white text-[28px] leading-none mb-3 shadow-[0_4px_12px_rgba(220,38,38,0.2)]">
          <span aria-hidden>🚛</span>
        </div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text">
          {title}
        </h1>
        <p className="text-[13px] text-text-sub mt-1">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}
