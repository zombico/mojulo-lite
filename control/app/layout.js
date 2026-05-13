import { Geist, Geist_Mono, Outfit } from 'next/font/google';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import AuthNav from '@/components/AuthNav';
import { rtlLocales } from '@/i18n/config';
import { isAuthEnabled } from '@/lib/auth/session';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
});

export const metadata = {
  title: 'Mojulo-Lite',
  description: 'Portable AI bot compiler — wizard + chat builder inverted flow',
};

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();

  const dir = rtlLocales.has(locale) ? 'rtl' : 'ltr';
  const authEnabled = isAuthEnabled();

  return (
    <html lang={locale} dir={dir}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <AuthNav authEnabled={authEnabled} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
