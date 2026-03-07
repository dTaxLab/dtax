import type { Metadata } from "next";
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import "../globals.css";
import { LocaleNav } from './nav';

export const metadata: Metadata = {
  title: "DTax — AI-Powered Crypto Tax Intelligence",
  description: "Open source crypto tax calculator with FIFO, LIFO, HIFO support. Calculate your crypto capital gains and generate tax reports.",
  keywords: ["crypto", "tax", "bitcoin", "FIFO", "capital gains", "portfolio"],
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Validate locale
  if (!routing.locales.includes(locale as 'en' | 'zh')) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <div className="container">
            <LocaleNav locale={locale} />
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
