import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';

// 3.840 orang Tuli per 1 JBI → 384 titik, 1 titik = 10 orang.
const DOTS = 384;
const JBI_INDEX = 202;

export function Stat() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const counter = { v: 0 };
        const num = root.current?.querySelector<HTMLElement>('.js-count');
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%', once: true } });
        tl.from('.js-stat-copy > *', { y: 20, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: EASE.enter })
          .to(
            counter,
            {
              v: 3840,
              duration: 1.4,
              ease: 'power2.out',
              onUpdate: () => {
                if (num) num.textContent = Math.round(counter.v).toLocaleString('id-ID');
              },
            },
            0.1,
          )
          .from('.js-dot-grid i', { scale: 0, duration: 0.35, stagger: { amount: 1.1, grid: 'auto', from: 'start' }, ease: EASE.enter }, 0.1)
          .from('.js-jbi-dot', { scale: 0, duration: 0.5, ease: EASE.pop }, '-=0.2')
          .from('.js-jbi-label', { autoAlpha: 0, y: 6, duration: 0.3 }, '<0.2');
      });
    },
    { scope: root },
  );

  return (
    <section id="masalah" ref={root} className="py-20 md:py-32">
      <div className="wrap grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-16">
        <div className="js-stat-copy">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Kenapa ini penting</p>
          <p className="mt-4 text-[clamp(56px,14vw,120px)] font-extrabold leading-[0.9] tracking-[-0.07em]">
            1 : <span className="js-count tabular-nums">3.840</span>
          </p>
          <p className="mt-4 max-w-[430px] text-[15px] leading-relaxed text-brand-600">
            Perkiraan rasio juru bahasa isyarat (JBI) terhadap penyandang Tuli di Indonesia. Standar WHO:{' '}
            <strong className="font-bold text-brand-900">1 : 100</strong>.
          </p>
          <p className="mt-3 max-w-[430px] text-[13px] leading-relaxed text-muted">
            Akibatnya, sebagian besar kunjungan ke layanan kesehatan terjadi tanpa pendamping. Keluhan, dosis obat, dan
            jadwal kontrol rawan salah paham.
          </p>
        </div>

        <figure className="rounded-[28px] border border-line bg-tint p-5 md:p-7">
          <div
            className="js-dot-grid grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[5px] sm:grid-cols-[repeat(24,minmax(0,1fr))] lg:grid-cols-[repeat(32,minmax(0,1fr))]"
            aria-hidden="true"
          >
            {Array.from({ length: DOTS }, (_, i) =>
              i === JBI_INDEX ? (
                <span key={i} className="relative aspect-square">
                  <i className="js-jbi-dot absolute inset-[-3px] block rounded-full bg-brand-600 ring-4 ring-brand-200" />
                </span>
              ) : (
                <i key={i} className="block aspect-square rounded-full bg-brand-100" />
              ),
            )}
          </div>
          <figcaption className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-semibold text-muted">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-brand-100" /> 1 titik = 10 orang Tuli
            </span>
            <span className="js-jbi-label flex items-center gap-2 text-brand-800">
              <span className="size-2.5 rounded-full bg-brand-600" /> 1 JBI untuk semuanya
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
