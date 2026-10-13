import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK, REDUCED } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { TabletDemo } from './TabletDemo';
import { Icon } from '../ui/Icon';
import { KIOSK_URL } from '../../config/links';
const HAND_FONT = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';
/** Tumpukan buku + gelas pensil (dekoratif). */
function BooksAndPencils({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 170 132" className={className} aria-hidden="true">
      <rect x="0" y="108" width="114" height="20" rx="5" className="fill-brand-600" />
      <rect x="12" y="114" width="70" height="3" rx="1.5" className="fill-white/60" />
      <rect x="10" y="88" width="98" height="20" rx="5" className="fill-brand-200" />
      <rect x="20" y="94" width="56" height="3" rx="1.5" className="fill-white" />
      <rect x="4" y="68" width="106" height="20" rx="5" className="fill-brand-400" />
      <rect x="16" y="74" width="62" height="3" rx="1.5" className="fill-white/70" />
      {/* Pensil */}
      <g strokeLinecap="round">
        <line x1="134" y1="84" x2="124" y2="30" className="stroke-brand-800" strokeWidth="6" />
        <line x1="142" y1="84" x2="146" y2="22" className="stroke-ok" strokeWidth="6" />
        <line x1="150" y1="84" x2="162" y2="36" className="stroke-brand-400" strokeWidth="6" />
      </g>
      <circle cx="124" cy="28" r="3" className="fill-brand-900" />
      <circle cx="146" cy="20" r="3" className="fill-brand-900" />
      <circle cx="162" cy="34" r="3" className="fill-brand-900" />
      <rect x="120" y="74" width="48" height="56" rx="10" className="fill-brand-50 stroke-brand-200" strokeWidth="2" />
      <rect x="128" y="92" width="32" height="4" rx="2" className="fill-brand-200" />
    </svg>
  );
}
export function Hero() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: EASE.enter } });
        tl.from('.js-hero-eyebrow', { y: 12, autoAlpha: 0, duration: 0.5 })
          .from('.js-hw', { yPercent: 45, autoAlpha: 0, duration: 0.75, stagger: 0.08 }, 0.05)
          .fromTo('.js-underline', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: EASE.reveal }, 0.55)
          .from('.js-hero-rest > *', { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.07 }, 0.4)
          .from('.js-hero-visual', { y: 40, scale: 0.96, autoAlpha: 0, duration: 0.9 }, 0.15)
          .from('.js-hero-deco', { scale: 0.85, autoAlpha: 0, duration: 0.55, stagger: 0.12, ease: EASE.pop }, 0.75);
      });
      mm.add(REDUCED, () => {
        gsap.from('.js-hero-copy, .js-hero-visual', { autoAlpha: 0, duration: 0.4 });
      });
    },
    { scope: root },
  );
  return (
    <section id="top" ref={root} className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-brand-50/50 to-white pb-24 pt-24 md:pb-32 md:pt-36">
      {/* Gumpalan lavender di latar */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 size-[380px] rounded-full bg-brand-100/50 blur-3xl" />
        <div className="absolute right-[-120px] top-[30%] size-[520px] rounded-full bg-brand-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-[40%] size-[260px] rounded-full bg-brand-100/40 blur-3xl" />
      </div>
      <div className="wrap relative grid grid-cols-1 items-center gap-12 md:grid-cols-[0.9fr_1.1fr] md:gap-10 lg:gap-16">
        <div className="js-hero-copy">
          <p className="js-hero-eyebrow inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-3.5 py-1.5 text-[12px] font-bold text-brand-600">
            <Icon name="sparkles" className="size-3.5" />
            Platform Edukasi Inklusif
          </p>
          <h1 className="mt-5 text-[clamp(42px,11vw,58px)] font-extrabold leading-[1] tracking-[-0.055em] md:text-[clamp(52px,5.6vw,80px)]">
            <span className="js-hw inline-block">Belajar</span> <span className="js-hw inline-block">jadi</span>{' '}
            <span className="js-hw inline-block">lebih</span>{' '}
            <span className="js-hw relative inline-block text-brand-600">
              dekat.
              <svg
                viewBox="0 0 200 20"
                preserveAspectRatio="none"
                className="absolute -bottom-[0.12em] left-0 h-[0.28em] w-full text-brand-400"
                aria-hidden="true"
              >
                <path
                  className="js-underline"
                  d="M4 13 C 44 4, 96 3, 136 9 S 186 16, 196 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset="0"
                />
              </svg>
            </span>
          </h1>
          <div className="js-hero-rest">
            <p className="mt-6 max-w-[460px] text-[16px] leading-relaxed text-brand-800 md:text-[17px]">
              Akses materi pembelajaran dalam bahasa isyarat, teks, dan audio. Untuk semua orang, termasuk teman-teman
              Tuli.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href={KIOSK_URL}
                className="group inline-flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-brand-600 py-3 pl-3 pr-5 text-[15px] font-bold text-white shadow-[0_12px_25px_rgba(83,74,183,0.28)] transition hover:-translate-y-0.5 hover:bg-brand-800 sm:flex-none"
              >
                <span className="grid size-8 place-items-center rounded-full bg-white/20">
                  <Icon name="play" className="size-3.5" fill="currentColor" />
                </span>
                Mulai Belajar
                <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#fitur"
                className="inline-flex items-center justify-center rounded-2xl border border-line bg-white px-5 py-3.5 text-[14px] font-bold text-brand-800 transition hover:bg-brand-50"
              >
                Lihat fitur
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-semibold text-muted">
              {['Video isyarat BISINDO', 'Chatbot AI', 'Riwayat belajar tersimpan'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Icon name="check" className="size-3.5 text-ok" strokeWidth={2.6} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="js-hero-visual relative pb-6 pt-14 sm:px-6">
          {/* Catatan tulisan tangan */}
          <div aria-hidden="true" className="js-hero-deco absolute right-2 top-0 z-10 hidden items-end gap-1 sm:flex">
            <svg viewBox="0 0 60 50" className="h-10 w-12 translate-y-6 text-brand-400">
              <path d="M54 6 C 34 4, 14 14, 10 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M3 32 L 10 42 L 18 33" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="-rotate-[4deg] text-[17px] font-bold leading-tight text-brand-800" style={{ fontFamily: HAND_FONT }}>
              Akses mudah,
              <br />
              untuk semua.
            </p>
          </div>
          <TabletDemo />
          <div aria-hidden="true" className="js-hero-deco absolute -bottom-8 -right-2 z-10 hidden w-[110px] sm:block md:-right-12 lg:w-[130px]">
            <BooksAndPencils className="w-full drop-shadow-[0_10px_16px_rgba(38,33,92,0.15)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
