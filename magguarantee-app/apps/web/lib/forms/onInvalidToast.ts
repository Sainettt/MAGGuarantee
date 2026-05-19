// Helper for `form.handleSubmit(onValid, onInvalid)` second callback.
//
// RHF runs `onInvalid` exactly when `zodResolver` (or any other resolver)
// rejects the submission — i.e. the same moment our forms today silently
// drop the click. This helper turns that silent block into:
//   1. a toast telling the user something is missing,
//   2. focus moved to the first offending field so they can scroll to it.
//
// Usage:
//   const onSubmit = form.handleSubmit(
//     (values) => { ... },
//     onInvalidToast(form.setFocus, t('common.validationFailedToast')),
//   );

import type { FieldErrors, FieldValues, UseFormSetFocus } from 'react-hook-form';
import { toast } from 'sonner';

export function onInvalidToast<T extends FieldValues>(
  setFocus: UseFormSetFocus<T>,
  message: string,
): (errors: FieldErrors<T>) => void {
  return (errors) => {
    // Surface every failing field+reason to the console so developers can
    // diagnose which schema rule rejected the submission. Cheap, harmless,
    // and the alternative (silent reject + only the first field focused) is
    // a frequent source of "I filled everything but it won't save" reports.
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[form] validation failed', errors);
    }
    toast.error(message);
    // First key in `errors` is the first failing field per RHF's iteration
    // order (which mirrors the schema). `setFocus` both focuses and scrolls
    // the input into view; if the path doesn't resolve to a registered field
    // (e.g. a cross-field `.refine(...)` path), we silently skip.
    const firstKey = Object.keys(errors)[0];
    if (!firstKey) return;
    try {
      setFocus(firstKey as Parameters<UseFormSetFocus<T>>[0]);
    } catch {
      /* unfocusable / unregistered — ignore */
    }
  };
}
