import { useRef, type ReactNode } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon } from '../ui/Icon';

type Step = { title: string; desc: string; glyph: ReactNode };

const STEPS: Step[] = [
  {
    title: 'Siap',
    desc: 'Kamera menunggu. Tidak ada tombol yang perlu ditekan.',
    glyph: <Icon name="hand" className="size-5 text-brand-600" />,
  },
  {
    title: 'Tangan terbaca',
    desc: 'Tangan harus stabil sesaat. Gerakan sekilas diabaikan.',
    glyph: <Icon name="scan" className="size-5 text-brand-600" />,
  },
  {
    title: 'Merekam',
    desc: 'Bingkai merah berdenyut pelan selama isyarat berlangsung.',
    glyph: <span className="size-4 rounded-full border-[3px] border-rec" />,
  },
  {
    title: 'Memproses',
    desc: 'Gerakan dicocokkan dengan frasa BISINDO tervalidasi.',
    glyph: <span className="size-5 rounded-full border-[3px] border-brand-100 border-t-brand-600" />,
  },
  {
    title: 'Tersampaikan',
    desc: 'Hasil tampil sebagai teks dan dibacakan untuk petugas.',
    glyph: <Icon name="volume" className="size-5 text-ok-ink" />,
  },
];

const GUARDS = [
  { value: '250 ms', label: 'Tangan harus stabil sebelum mulai merekam' },
  { value: '1,5 dtk', label: 'Diam selama ini menandakan isyarat selesai' },
  { value: '0,5 dtk', label: 'Rekaman lebih pendek dianggap tidak disengaja' },
  { value: '8 dtk', label: 'Batas maksimal satu rekaman' },
];

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.js-step', {
          y: 24,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 0.55,
          ease: EASE.enter,
          scrollTrigger: { trigger: '.js-steps', start: 'top 78%', once: true },
        });
        gsap.fromTo(
          '.js-line-x',
          { scaleX: 0 },
          { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.js-steps', start: 'top 75%', end: 'bottom 45%', scrub: 0.5 } },
        );
        gsap.fromTo(
          '.js-line-y',
          { scaleY: 0 },
          { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.js-steps', start: 'top 70%', end: 'bottom 55%', scrub: 0.5 } },
        );
        gsap.from('.js-guard', {
          y: 16,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.5,
          ease: EASE.enter,
          scrollTrigger: { trigger: '.js-guards', start: 'top 85%', once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="cara-kerja" ref={root} className="bg-tint py-20 md:py-28">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h2 className="text-[clamp(36px,7vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]">
            Selalu tahu
            <br />
            sistem sedang apa.
          </h2>
          <p className="max-w-[330px] text-[14px] leading-relaxed text-brand-600">
            Tidak ada tombol yang menandai “sedang mendengarkan”. Karena itu setiap status selalu tampil sebagai
            warna, ikon, dan teks.
          </p>
        </div>

        <ol className="js-steps relative mt-12 grid gap-7 md:mt-16 md:grid-cols-5 md:gap-5">
          <span aria-hidden="true" className="absolute bottom-6 left-[27px] top-6 w-px bg-brand-100 md:hidden">
            <span className="js-line-y block h-full w-full origin-top bg-brand-600" />
          </span>
          <span aria-hidden="true" className="absolute left-7 right-7 top-[27px] hidden h-px bg-brand-100 md:block">
            <span className="js-line-x block h-full w-full origin-left bg-brand-600" />
          </span>

          {STEPS.map((s, i) => (
            <li key={s.title} className="js-step relative flex gap-4 md:flex-col md:gap-5">
              <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl border border-brand-100 bg-white">
                {s.glyph}
              </span>
              <div>
                <span className="text-[11px] font-extrabold text-brand-400">0{i + 1}</span>
                <h3 className="mt-0.5 text-[18px] font-extrabold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <dl className="js-guards mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-brand-100 bg-brand-100 md:mt-20 md:grid-cols-4">
          {GUARDS.map((g) => (
            <div key={g.value} className="js-guard bg-white p-5 md:p-6">
              <dt className="text-[26px] font-extrabold tracking-[-0.04em] md:text-[32px]">{g.value}</dt>
              <dd className="mt-1 text-[12px] leading-snug text-muted">{g.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
