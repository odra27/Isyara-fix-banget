import { useRef } from 'react';
import { gsap, SplitText, useGSAP, MOTION_OK, REDUCED } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon } from '../ui/Icon';

/**
 * Intro scroll "pin + circle reveal" (prompt animasi §11), diadaptasi tanpa video & tanpa Lenis.
 * Cleanup memakai gsap.context (useGSAP), bukan ScrollTrigger.getAll().kill().
 */
type Turn = {
  who: 'pasien' | 'petugas' | 'unknown';
  label: string;
  text: string;
  meta: string;
};

const TURNS: Turn[] = [
  { who: 'pasien', label: 'Pasien · isyarat', text: 'Saya demam', meta: '94% · langsung jadi teks + suara' },
  {
    who: 'petugas',
    label: 'Petugas · suara',
    text: '“Demamnya sudah berapa hari, Bu?”',
    meta: 'Dicocokkan ke “Sudah berapa hari?” · video BISINDO',
  },
  { who: 'pasien', label: 'Pasien · isyarat', text: 'Saya butuh resep', meta: '72% · pasien konfirmasi dulu' },
  { who: 'unknown', label: 'Pasien · isyarat', text: 'Gerakan di luar kosakata', meta: 'Tidak menebak · tawarkan Panggil JBI' },
];

const TAGS = ['Pendaftaran', 'Keluhan', 'Obat', 'Administrasi'];

export function RevealScene() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create('.js-reveal-title', { type: 'words' });
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=230%', pin: true, scrub: 0.6, anticipatePin: 1 },
        });
        tl.from(split.words, { opacity: 0.12, stagger: 0.12, duration: 0.5 })
          .from('.js-seed-label', { autoAlpha: 0, y: 8, duration: 0.3 }, '<0.3')
          .to('.js-seed-label', { autoAlpha: 0, duration: 0.2 }, '+=0.3')
          .fromTo(
            '.js-circle',
            { clipPath: 'circle(3.2% at 50% 80%)' },
            { clipPath: 'circle(150% at 50% 80%)', duration: 1.5, ease: EASE.reveal },
            '<',
          )
          .from('.js-scene-head > *', { y: 24, autoAlpha: 0, stagger: 0.1, duration: 0.4 }, '-=0.45')
          .from('.js-turn', { y: 36, autoAlpha: 0, stagger: 0.35, duration: 0.45 })
          .from('.js-scene-tag', { y: 10, autoAlpha: 0, stagger: 0.06, duration: 0.25 }, '-=0.2')
          .to({}, { duration: 0.4 });
        return () => split.revert();
      });
      mm.add(REDUCED, () => {
        gsap.set('.js-circle', { clipPath: 'none' });
      });
    },
    { scope: root },
  );

  return (
    <section id="dua-arah" ref={root} className="relative h-svh min-h-[600px] overflow-hidden bg-white">
      {/* Lapisan 1: pernyataan */}
      <div className="wrap flex h-full flex-col items-center justify-center pb-24 text-center">
        <p className="js-reveal-title max-w-[900px] text-[clamp(38px,8.5vw,84px)] font-extrabold leading-[0.98] tracking-[-0.06em]">
          Satu perangkat. Dua arah. Di meja layanan.
        </p>
        <p className="js-seed-label invisible absolute bottom-[12%] text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          Gulir untuk melihat percakapan
        </p>
      </div>

      {/* Lapisan 2: percakapan, terbuka lewat lingkaran */}
      <div className="js-circle absolute inset-0 bg-brand-900 text-white [clip-path:circle(3.2%_at_50%_80%)]">
        <div className="wrap grid h-full content-center gap-7 pb-6 pt-20 md:grid-cols-[1fr_1.15fr] md:items-center md:gap-16">
          <div className="js-scene-head">
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-200">Contoh di loket Puskesmas</p>
            <h2 className="mt-3 text-[clamp(30px,6vw,58px)] font-extrabold leading-[0.98] tracking-[-0.055em]">
              Pasien mengisyaratkan.
              <br />
              <span className="text-brand-200">Petugas cukup bicara.</span>
            </h2>
            <p className="mt-4 hidden max-w-[400px] text-[14px] leading-relaxed text-brand-100 md:block">
              Kamera dan layar menghadap pasien. Speaker dan mic untuk petugas. Tidak perlu akun, tidak perlu pairing
              dua perangkat.
            </p>
            <ul className="mt-5 hidden flex-wrap gap-2 md:flex" aria-label="Kategori kosakata">
              {TAGS.map((t) => (
                <li key={t} className="js-scene-tag rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-brand-100">
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <ol className="flex flex-col gap-2.5 md:gap-3.5">
            {TURNS.map((t, i) => (
              <li
                key={i}
                className={`js-turn flex max-w-[88%] flex-col ${t.who === 'petugas' ? 'items-end self-end text-right' : 'items-start'}`}
              >
                <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand-200">
                  <Icon name={t.who === 'petugas' ? 'mic' : 'hand'} className="size-3" />
                  {t.label}
                </span>
                <span
                  className={`rounded-2xl px-4 py-2.5 text-[15px] font-bold leading-snug md:text-[17px] ${
                    t.who === 'petugas'
                      ? 'rounded-tr-md bg-brand-600'
                      : t.who === 'unknown'
                        ? 'rounded-tl-md border border-dashed border-white/35 text-brand-100'
                        : 'rounded-tl-md bg-white text-brand-900'
                  }`}
                >
                  {t.text}
                </span>
                <span className="mt-1 text-[11px] font-medium text-brand-200">{t.meta}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
