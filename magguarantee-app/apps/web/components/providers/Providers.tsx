'use client';

// Top-level client providers: TanStack Query (server state), next-themes
// (theme toggle), Sonner (toasts). next-intl's provider lives in
// `app/layout.tsx` because it needs server-resolved messages.
//
// Global error policy (see `lib/query/globalErrors.ts` for the full contract):
// the QueryCache / MutationCache `onError` hooks raise ONE deduplicated sonner
// toast per error kind. 401s, cancellations and anything that owns its error
// UX (`meta.suppressGlobalError`, or a mutation with a hook-level `onError`)
// are skipped, so there are no double toasts and no toast storms.

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';

import {
  globalErrorToast,
  shouldToastMutationError,
  shouldToastQueryError,
  type GlobalErrorScope,
} from '@/lib/query/globalErrors';

export function Providers({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  // The QueryClient is created once, but the locale can change at runtime
  // (LanguageToggle → router.refresh re-renders providers with new messages).
  // Read the translator through a ref so toasts always use the current locale.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [client] = useState(() => {
    const notify = (scope: GlobalErrorScope, error: unknown) => {
      const { id, messageKey } = globalErrorToast(scope, error);
      // Same id ⇒ sonner updates the visible toast instead of stacking another.
      toast.error(tRef.current(messageKey), { id });
    };

    return new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (shouldToastQueryError(error, query)) notify('query', error);
        },
      }),
      mutationCache: new MutationCache({
        onError: (error, _variables, _ctx, mutation) => {
          if (shouldToastMutationError(error, mutation)) {
            notify('mutation', error);
          }
        },
      }),
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });
  });

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        storageKey="mt_theme"
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
