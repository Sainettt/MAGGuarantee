// Step 2 banner: brand-tinted background + a Mail icon, prints
// "Sent to <masked email>" plus the 10-minute lifetime line. The masked
// value comes already-masked from the API (`pr***@magtrans.eu`) — never
// remask it client-side.

import { Mail } from 'lucide-react';

interface EmailHintBannerProps {
  /** Server-pre-masked email, e.g. `pr***@magtrans.eu`. */
  maskedEmail: string;
  intro: string;
  lifetime: string;
}

export function EmailHintBanner({
  maskedEmail,
  intro,
  lifetime,
}: EmailHintBannerProps) {
  return (
    <div className="mb-6 px-4 py-3.5 rounded-[10px] border border-brand-200 bg-brand-50 dark:bg-brand/15 dark:border-brand/30 text-center">
      <div className="flex items-center justify-center gap-2 text-[13px] text-brand-800 dark:text-brand-200">
        <Mail size={16} aria-hidden />
        <span>{intro}</span>
      </div>
      <div className="mt-1 text-[13px] font-bold text-brand-800 dark:text-brand-200">
        {maskedEmail}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-text-sub">
        {lifetime}
      </div>
    </div>
  );
}
