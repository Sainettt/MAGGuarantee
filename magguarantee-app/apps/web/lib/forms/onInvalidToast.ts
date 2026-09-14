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

/**
 * Dotted paths of the failing fields (`address.city`, `files.0`), walked
 * without reading `ref` / `message` so no field VALUE can leak into the log.
 * Exported for tests.
 */
export function collectErrorPaths(errors: unknown, prefix = ''): string[] {
  if (typeof errors !== 'object' || errors === null) return [];
  const paths: string[] = [];
  for (const [key, entry] of Object.entries(errors)) {
    if (key === 'ref' || key === 'message' || key === 'type' || key === 'types') {
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    // A leaf FieldError carries `type`; nested objects/arrays recurse.
    if ('type' in entry) {
      paths.push(path);
    } else {
      const nested = collectErrorPaths(entry, path);
      if (nested.length > 0) paths.push(...nested);
      else paths.push(path);
    }
  }
  return paths;
}

export function onInvalidToast<T extends FieldValues>(
  setFocus: UseFormSetFocus<T>,
  message: string,
): (errors: FieldErrors<T>) => void {
  return (errors) => {
    // Dev-only diagnostics: list the failing field NAMES so developers can see
    // which schema rule rejected the submission. Never log the `errors` object
    // itself — each entry holds a `ref` to the DOM input (and thus the value
    // the user typed: NIP, IBAN, names…), and never log in production.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[form] validation failed', {
        fields: collectErrorPaths(errors),
      });
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
