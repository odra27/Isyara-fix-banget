import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';
import { LOGIN_URL, isValidAppUrl } from '../../config/links';
const LINKS = [
  { href: '#top', label: 'Beranda' },
  { href: '#fitur', label: 'Fitur' },
  { href: '#chatbot', label: 'Chatbot' },
  { href: '#cara-kerja', label: 'Cara kerja' },
  { href: '#tentang', label: 'Tentang' },
];
export function Nav() {
  return (
    <header className="fixed left-1/2 top-3 z-50 w-[min(1160px,calc(100%-24px))] -translate-x-1/2">
      <div className="flex h-14 items-center justify-between rounded-2xl border border-line/90 bg-white/80 pl-4 pr-2 backdrop-blur-xl">
        <a href="#top" aria-label="ISYARA, kembali ke atas">
          <Logo />
        </a>
        <nav aria-label="Navigasi utama" className="hidden gap-6 text-[13px] font-semibold text-brand-600 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-brand-900">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#sekolah"
            className="hidden min-h-11 items-center gap-1.5 rounded-full bg-brand-50 px-4 py-2.5 text-[12.5px] font-bold text-brand-800 transition-colors hover:bg-brand-100 sm:inline-flex"
          >
            <Icon name="school" className="size-4" />
            Untuk Sekolah
          </a>
          <a
            href={LOGIN_URL}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-[12.5px] font-bold text-white shadow-[0_8px_20px_rgba(83,74,183,0.25)] transition-colors hover:bg-brand-800"
          >
            Masuk
          </a>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {!isValidAppUrl(LOGIN_URL) && (
          <p className="mt-2 rounded-xl border border-line bg-white px-3.5 py-2 text-[12px] font-semibold text-brand-900">
            Tujuan halaman masuk belum tersedia. Hubungi admin sekolah atau periksa pengaturan VITE_LOGIN_URL.
          </p>
        )}
      </div>
    </header>
  );
}
