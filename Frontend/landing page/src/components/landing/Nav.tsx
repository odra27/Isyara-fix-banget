import { useState } from 'react';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';
import { KIOSK_URL, LOGIN_URL, isValidAppUrl } from '../../config/links';

const LINKS = [
  { href: '#dua-arah', label: 'Dua arah' },
  { href: '#cara-kerja', label: 'Cara kerja' },
  { href: '#jbi', label: 'JBI' },
  { href: '#kosakata', label: 'Kosakata' },
];

export function Nav() {
  // Tujuan login dibaca dari env; nilai keliru tidak dibuka, tapi diberi tahu ke pengguna.
  const [loginError, setLoginError] = useState(false);

  const openLogin = () => {
    if (!isValidAppUrl(LOGIN_URL)) {
      setLoginError(true);
      return;
    }
    window.location.assign(LOGIN_URL);
  };

  return (
    <header className="fixed left-1/2 top-3 z-50 w-[min(1160px,calc(100%-24px))] -translate-x-1/2">
      <div className="flex h-14 items-center justify-between rounded-2xl border border-line/90 bg-white/80 pl-4 pr-2 backdrop-blur-xl">
        <a href="#top" aria-label="ISYARA, kembali ke atas">
          <Logo />
        </a>
        <nav aria-label="Navigasi utama" className="hidden gap-7 text-[13px] font-semibold text-brand-600 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-brand-900">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3.5">
          {/* "Masuk / Login" bergaya seperti item menu navbar (tanpa border, hover ganti warna). */}
          <button
            type="button"
            onClick={openLogin}
            className="inline-flex items-center rounded-lg px-1 py-1 text-[13px] font-semibold text-brand-600 transition-colors hover:text-brand-900"
          >
            Masuk / Login
          </button>
          <a
            href={KIOSK_URL}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-900 px-3.5 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-brand-800"
          >
            Buka kiosk
            <Icon name="arrowUpRight" className="size-3.5" />
          </a>
        </div>
      </div>

      <div role="status" aria-live="polite">
        {loginError && (
          <p className="mt-2 rounded-xl border border-line bg-white px-3.5 py-2 text-[12px] font-semibold text-brand-900">
            Tujuan halaman masuk belum tersedia. Hubungi admin atau periksa pengaturan VITE_LOGIN_URL.
          </p>
        )}
      </div>
    </header>
  );
}
