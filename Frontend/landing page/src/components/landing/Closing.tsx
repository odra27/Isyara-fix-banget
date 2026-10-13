import { useRef } from 'react';
import { gsap, SplitText, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';

import { KIOSK_URL } from '../../config/links';

export function Closing() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create('.js-cta-title', { type: 'lines' });
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%', once: true } });
        tl.from(split.lines, { yPercent: 40, autoAlpha: 0, stagger: 0.1, duration: 0.8, ease: EASE.enter }).from(
          '.js-cta-btn',
          { y: 14, autoAlpha: 0, duration: 0.5, ease: EASE.enter },
          '-=0.4',
        );
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <>
      <section id="mulai" ref={root} className="px-3 pb-3 md:px-5 md:pb-5">
        <div className="relative overflow-hidden rounded-[32px] bg-brand-600 px-6 py-16 text-white md:rounded-[40px] md:px-14 md:py-24">
          <div aria-hidden="true" className="absolute -right-24 -top-24 size-[420px] rounded-full border border-white/15" />
          <div aria-hidden="true" className="absolute -right-4 -top-4 size-[260px] rounded-full border border-white/10" />
          <h2 className="js-cta-title relative max-w-[820px] text-[clamp(40px,8.5vw,88px)] font-extrabold leading-[0.95] tracking-[-0.065em]">
            Teknologi yang membuka percakapan.
          </h2>
          <div className="js-cta-btn relative mt-9 flex flex-wrap gap-2.5">
            <a
              href={KIOSK_URL}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-[14px] font-bold text-brand-900 transition hover:-translate-y-0.5 sm:flex-none"
            >
              Buka demo kiosk
              <Icon name="arrowRight" className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="py-8 text-[12px] text-muted">
        <div className="wrap flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Logo size="sm" />
          <p className="max-w-[440px]">
            AI membantu mengenali sejumlah frasa BISINDO yang telah divalidasi untuk skenario layanan Puskesmas.
          </p>
          <p>© 2026 ISYARA · Hackathon JOINTS</p>
        </div>
      </footer>
    </>
  );
}
