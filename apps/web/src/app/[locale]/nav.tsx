'use client';

import { useTranslations, useLocale } from 'next-intl';
import { usePathname, Link } from '@/i18n/navigation';

export function LocaleNav({ locale }: { locale: string }) {
    const t = useTranslations('nav');
    const pathname = usePathname();
    const currentLocale = useLocale();
    const otherLocale = currentLocale === 'en' ? 'zh' : 'en';
    const otherLabel = currentLocale === 'en' ? '中文' : 'EN';

    return (
        <nav className="nav">
            <Link href="/" className="nav-brand">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect width="28" height="28" rx="8" fill="#6366f1" />
                    <text x="6" y="20" fill="white" fontSize="16" fontWeight="bold" fontFamily="Inter">D</text>
                </svg>
                <span>DTax</span>
            </Link>
            <div className="nav-links">
                <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
                    {t('dashboard')}
                </Link>
                <Link href="/transactions" className={`nav-link ${pathname === '/transactions' ? 'active' : ''}`}>
                    {t('transactions')}
                </Link>
                <Link href="/tax" className={`nav-link ${pathname === '/tax' ? 'active' : ''}`}>
                    {t('taxReport')}
                </Link>
                <span className="nav-divider" style={{
                    width: '1px', height: '20px', background: 'var(--border)',
                    margin: '0 4px', alignSelf: 'center',
                }} />
                <Link href={pathname} locale={otherLocale} className="nav-link locale-switch">
                    {otherLabel}
                </Link>
            </div>
        </nav>
    );
}
