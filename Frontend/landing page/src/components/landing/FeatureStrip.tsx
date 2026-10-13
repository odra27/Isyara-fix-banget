import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon, type IconName } from '../ui/Icon';
const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'play', title: 'Video Pembelajaran', desc: 'Dengan bahasa isyarat' },
  { icon: 'captions', title: 'Teks & Audio', desc: 'Untuk semua kebutuhan' },
  { icon: 'message', title: 'Chatbot AI', desc: 'Tanya apa saja' },
  { icon: 'globe', title: 'Akses Fleksibel', desc: 'Di mana saja, kapan saja' },
];
export function FeatureStrip() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 92%', once: true } });
        tl.from('.js-strip', { y: 30, autoAlpha: 0, duration: 0.6, ease: EASE.enter }).from(
          '.js-strip-item',
          { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.45, ease: EASE.enter },
          '-=0.3',
        );
      });
    },
    { scope: root },
  );
  return (
    <section id="fitur" ref={root} aria-labelledby="fitur-judul" className="relative z-10 -mt-14 pb-16 md:-mt-20 md:pb-24">
      <div className="wrap">
        <h2 id="fitur-judul" className="sr-only">
          Fitur utama ISYARA
        </h2>
        <ul className="js-strip grid grid-cols-1 gap-px overflow-hidden rounded-[28px] border border-line bg-line shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="js-strip-item flex items-center gap-4 bg-white p-5 md:p-6">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <Icon name={f.icon} className="size-5" fill={f.icon === 'play' ? 'currentColor' : 'none'} />
              </span>
              <span>
                <span className="block text-[15px] font-extrabold tracking-[-0.02em]">{f.title}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{f.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
