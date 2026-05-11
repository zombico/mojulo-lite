import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales } from './config';

const allowed = new Set(locales);

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = requested && allowed.has(requested) ? requested : defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
