// next-intl request config — server-side resolves the active locale per
// request. Reading order: `mt_lang` cookie → `Accept-Language` header →
// default (`pl`). No URL prefixing.

import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  pickLocaleFromAcceptLanguage,
  type Locale,
} from './config';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale;
  if (isLocale(cookieValue)) {
    locale = cookieValue;
  } else {
    const headerStore = await headers();
    locale = pickLocaleFromAcceptLanguage(headerStore.get('accept-language'));
  }
  if (!isLocale(locale)) locale = defaultLocale;

  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
