// Locale-aware error messages for Zod validation. Used by every form in the
// app — RHF + zodResolver picks these up automatically on validation failures.
//
// IMPORTANT: this module no longer self-installs. `z.setErrorMap` must run in
// the CLIENT JS runtime (where react-hook-form + zodResolver actually validate)
// — a module-level call imported only from a Server Component never reaches the
// browser bundle. Installation happens in `ZodLocaleProvider` (a client
// component), which builds the map from next-intl translations and re-installs
// it on locale change (PL ⇄ EN toggle).
//
// Schema-supplied custom messages (e.g. `z.string().regex(/.../, 'custom')`)
// always win over this map; we only fill in the gaps when the schema didn't
// say anything specific.

import { ZodIssueCode, type ZodErrorMap } from 'zod';

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function createZodErrorMap(t: Translate): ZodErrorMap {
  return (issue, ctx) => {
    switch (issue.code) {
      case ZodIssueCode.invalid_type: {
        // `received: 'undefined' | 'null'` is what Zod reports when a required
        // field came in empty — that's the "field is required" case the
        // logists actually see day-to-day.
        if (issue.received === 'undefined' || issue.received === 'null') {
          return { message: t('required') };
        }
        return { message: t('invalidType') };
      }
      case ZodIssueCode.too_small: {
        if (issue.type === 'string') {
          if (issue.minimum === 1) {
            return { message: t('required') };
          }
          return {
            message: t('stringMin', { min: Number(issue.minimum) }),
          };
        }
        if (issue.type === 'number') {
          return {
            message: t('numberMin', { min: Number(issue.minimum) }),
          };
        }
        if (issue.type === 'array') {
          return {
            message: t('arrayMin', { min: Number(issue.minimum) }),
          };
        }
        if (issue.type === 'date') {
          return { message: t('dateMin') };
        }
        break;
      }
      case ZodIssueCode.too_big: {
        if (issue.type === 'string') {
          return {
            message: t('stringMax', { max: Number(issue.maximum) }),
          };
        }
        if (issue.type === 'number') {
          return {
            message: t('numberMax', { max: Number(issue.maximum) }),
          };
        }
        if (issue.type === 'array') {
          return {
            message: t('arrayMax', { max: Number(issue.maximum) }),
          };
        }
        if (issue.type === 'date') {
          return { message: t('dateMax') };
        }
        break;
      }
      case ZodIssueCode.invalid_string: {
        if (issue.validation === 'email') {
          return { message: t('email') };
        }
        if (issue.validation === 'uuid') {
          // Every uuid field in these forms is a <select>, so an "invalid uuid"
          // really means "you didn't pick anything from the list".
          return { message: t('selectFromList') };
        }
        if (issue.validation === 'url') {
          return { message: t('url') };
        }
        // For `regex` validations the schema usually supplies a custom message
        // (e.g. NipSchema, EuVatSchema). `ctx.defaultError` carries that string;
        // if the schema author didn't bother, fall through to a generic.
        return { message: ctx.defaultError ?? t('format') };
      }
      case ZodIssueCode.invalid_enum_value:
        return { message: t('enum') };
      case ZodIssueCode.invalid_date:
        return { message: t('date') };
      case ZodIssueCode.invalid_union:
        return { message: t('generic') };
    }
    // Default: keep whatever the schema supplied (custom messages), otherwise a
    // generic localized fallback. For `custom` issues `ctx.defaultError` is the
    // schema's custom message, which is what we want.
    return { message: ctx.defaultError ?? t('generic') };
  };
}
