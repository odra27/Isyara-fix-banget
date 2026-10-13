import { useRef } from 'react';
import { gsap, SplitText, useGSAP, MOTION_OK, REDUCED } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { KioskDemo } from './KioskDemo';
import { Icon } from '../ui/Icon';

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create('.js-hero-title', { type: 'lines' });
        const tl = gsap.timeline({ defaults: { ease: EASE.enter } });
        tl.from('.js-hero-eyebrow', { y: 12, autoAlpha: 0, duration: 0.5 })
          .from(split.lines, { yPercent: 40, autoAlpha: 0, duration: 0.8, stagger: 0.1 }, 0.05)
          .from('.js-hero-visual', { y: 40, autoAlpha: 0, duration: 0.9 }, 0.15)
          .from('.js-hero-chip', { scale: 0.85, autoAlpha: 0, duration: 0.5, stagger: 0.12, ease: EASE.pop }, 0.6)
          .from('.js-hero-rest > *', { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.07 }, 0.35);
        return () => split.revert();
      });
      mm.add(REDUCED, () => {
        gsap.from('.js-hero-visual, .js-hero-copy, .js-hero-rest', { autoAlpha: 0, duration: 0.4 });
      });
    },
    { scope: root },
  );

  return (
    <section
      id="top"
      ref={root}
      className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-brand-50/60 to-white pb-14 pt-24 md:pb-24 md:pt-36"
    >
      {/* Cincin sinyal di belakang kiosk */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[44%] size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-400/15 md:left-[74%] md:top-1/2 md:size-[680px]" />
        <div className="absolute left-1/2 top-[44%] size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-200/25 blur-3xl md:left-[74%] md:top-1/2" />
      </div>

      <div className="wrap relative grid grid-cols-1 gap-7 md:grid-cols-[1fr_300px] md:gap-x-12 lg:grid-cols-[1fr_380px] lg:gap-x-20">
        <div className="js-hero-copy md:self-end">
          <p className="js-hero-eyebrow mb-3 inline-flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-600 md:mb-5">
            <span className="size-1.5 rounded-full bg-ok" />
            Untuk layanan Puskesmas
          </p>
          <h1 className="js-hero-title text-[clamp(40px,11.2vw,56px)] font-extrabold leading-[0.95] tracking-[-0.065em] md:text-[clamp(52px,6.4vw,92px)]">
            Isyarat didengar.
            <br />
            <span className="text-brand-600">Suara dilihat.</span>
          </h1>
        </div>

        <div className="js-hero-visual relative md:col-start-2 md:row-span-2 md:row-start-1 md:self-center">
          <div className="js-hero-chip absolute -left-1 top-16 z-10 flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-[11px] font-bold shadow-soft sm:left-2 md:-left-10">
            <Icon name="hand" className="size-3.5 text-brand-600" />
            Isyarat
            <Icon name="arrowRight" className="size-3 text-muted" />
            <Icon name="volume" className="size-3.5 text-brand-600" />
            Suara
          </div>
          <div className="js-hero-chip absolute -right-1 bottom-28 z-10 flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-[11px] font-bold shadow-soft sm:right-2 md:-right-8">
            <span className="size-2 rounded-full bg-ok" />
            Tanpa tombol rekam
          </div>
          <KioskDemo />
        </div>

        <div className="js-hero-rest md:self-start">
          <p className="hidden max-w-[440px] text-[16px] leading-relaxed text-brand-600 sm:block">
            ISYARA membantu pasien Tuli dan petugas Puskesmas saling memahami lewat isyarat, teks, dan suara. Satu
            perangkat di meja layanan, dua arah.
          </p>
          <div className="flex flex-wrap gap-2.5 sm:mt-7">
            <a
              href="#dua-arah"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3.5 text-[14px] font-bold text-white shadow-[0_12px_25px_rgba(83,74,183,0.25)] transition hover:-translate-y-0.5 hover:bg-brand-800 sm:flex-none"
            >
              Lihat cara kerjanya
              <Icon name="arrowDown" className="size-4" />
            </a>
            <a
              href="#masalah"
              className="hidden items-center justify-center rounded-2xl border border-line bg-white px-5 py-3.5 text-[14px] font-bold text-brand-800 transition hover:bg-brand-50 sm:inline-flex"
            >
              Kenapa ISYARA
            </a>
          </div>
          <ul className="mt-8 hidden flex-wrap gap-x-5 gap-y-2 text-[12px] font-semibold text-muted md:flex">
            {['Tanpa akun', 'Tanpa pairing', '1 perangkat per konter'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icon name="check" className="size-3.5 text-ok" strokeWidth={2.6} />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
