'use client';

// Installs the locale-aware Zod error map in the CLIENT runtime. This is where
// react-hook-form + zodResolver actually validate, so the map must be set here
// (not from the Server Component layout). Fixes every zodResolver-backed form
// at once with zero changes to individual call-sites.

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { z } from 'zod';

import { createZodErrorMap } from '@/lib/zod-locale';

export function ZodLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('validation.zod');

  // Install in render (via useMemo) so the map is active before any form
  // validates. Keyed on [t]: the PL ⇄ EN toggle does a soft router.refresh(),
  // which keeps the client tree mounted but makes next-intl re-provide the
  // messages — so `t` gets a new identity and the map is re-installed with the
  // new locale's strings. Within a locale `t` is stable, so this runs once.
  useMemo(() => {
    z.setErrorMap(createZodErrorMap((key, values) => t(key, values)));
  }, [t]);

  return <>{children}</>;
}
