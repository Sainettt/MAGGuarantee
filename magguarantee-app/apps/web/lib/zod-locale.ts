// Polish error messages for Zod validation, installed globally via
// `z.setErrorMap`. Used by every form in the app — RHF + zodResolver picks
// these up automatically on validation failures.
//
// Schema-supplied custom messages (e.g. `z.string().regex(/.../, 'custom')`)
// always win over this map; we only fill in the gaps when the schema didn't
// say anything specific.
//
// Imported for its side effect from `app/layout.tsx`. The module-level
// `z.setErrorMap(...)` call runs on both server and client (Next.js App
// Router dedupes the import); both bundlings see the Polish defaults.

import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

const polishErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type: {
      // `received: 'undefined' | 'null'` is what Zod reports when a required
      // field came in empty — that's the "Pole musi być uzupełnione" case the
      // logists actually see day-to-day.
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Pole musi być uzupełnione' };
      }
      return { message: 'Niepoprawny typ wartości' };
    }
    case ZodIssueCode.too_small: {
      if (issue.type === 'string') {
        if (issue.minimum === 1) {
          return { message: 'Pole musi być uzupełnione' };
        }
        return {
          message: `Tekst musi mieć co najmniej ${issue.minimum} znaków`,
        };
      }
      if (issue.type === 'number') {
        return {
          message: `Wartość musi wynosić co najmniej ${issue.minimum}`,
        };
      }
      if (issue.type === 'array') {
        return {
          message: `Wymagane co najmniej ${issue.minimum} pozycji`,
        };
      }
      if (issue.type === 'date') {
        return { message: 'Data jest zbyt wczesna' };
      }
      break;
    }
    case ZodIssueCode.too_big: {
      if (issue.type === 'string') {
        return {
          message: `Tekst nie może być dłuższy niż ${issue.maximum} znaków`,
        };
      }
      if (issue.type === 'number') {
        return {
          message: `Wartość nie może być większa niż ${issue.maximum}`,
        };
      }
      if (issue.type === 'array') {
        return {
          message: `Maksymalnie ${issue.maximum} pozycji`,
        };
      }
      if (issue.type === 'date') {
        return { message: 'Data jest zbyt późna' };
      }
      break;
    }
    case ZodIssueCode.invalid_string: {
      if (issue.validation === 'email') {
        return { message: 'Niepoprawny adres email' };
      }
      if (issue.validation === 'uuid') {
        return { message: 'Wybierz wartość z listy' };
      }
      if (issue.validation === 'url') {
        return { message: 'Niepoprawny adres URL' };
      }
      // For `regex` validations the schema usually supplies a custom message
      // (e.g. NipSchema, EuVatSchema). `ctx.defaultError` carries that string;
      // if the schema author didn't bother, fall through to a generic.
      return { message: ctx.defaultError ?? 'Niepoprawny format' };
    }
    case ZodIssueCode.invalid_enum_value:
      return { message: 'Niepoprawna wartość' };
    case ZodIssueCode.invalid_date:
      return { message: 'Niepoprawna data' };
    case ZodIssueCode.invalid_union:
      return { message: 'Niepoprawna wartość' };
  }
  // Default: keep whatever the schema or Zod's English fallback supplied.
  // For `custom` issues this is the schema's custom message, which is what
  // we want.
  return { message: ctx.defaultError };
};

z.setErrorMap(polishErrorMap);
