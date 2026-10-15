import { useRef } from 'react';
import { gsap, SplitText, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon, type IconName } from '../ui/Icon';
/**
 * "Kenapa ini penting": poin kualitatif, sengaja tanpa angka statistik
 * (tidak ada data terverifikasi yang dikutip di sini).
 */
const POINTS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'hand',
    title: 'Materi dalam bahasa yang paling dipahami',
    desc: 'Banyak bahan belajar hanya tersedia sebagai teks atau suara. ISYARA menghadirkan video pelajaran dengan bahasa isyarat BISINDO, ditemani teks dan audio.',
  },
  {
    icon: 'message',
    title: 'Bertanya tanpa ragu',
    desc: 'Kalau ada yang belum jelas, siswa bisa langsung bertanya ke chatbot dengan mengetik atau berisyarat, kapan saja.',
  },
  {
    icon: 'users',
    title: 'Tanya tepat di bagian yang bikin bingung',
    desc: 'Saat menonton video, siswa bisa langsung bertanya pada menit tertentu. ISYARA menjawab berdasarkan isi bagian itu.',
  },
];
export function Why() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create('.js-why-title', { type: 'lines' });
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 72%', once: true } });
        tl.from('.js-why-eyebrow', { y: 10, autoAlpha: 0, duration: 0.4, ease: EASE.enter })
          .from(split.lines, { yPercent: 40, autoAlpha: 0, stagger: 0.1, duration: 0.7, ease: EASE.enter }, 0.1)
          .from('.js-why-point', { y: 28, autoAlpha: 0, stagger: 0.12, duration: 0.6, ease: EASE.enter }, 0.35);
        return () => split.revert();
      });
    },
    { scope: root },
  );
  return (
    <section id="tentang" ref={root} className="py-16 md:py-24">
      <div className="wrap">
        <p className="js-why-eyebrow text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Kenapa ini penting</p>
        <h2 className="js-why-title mt-3 max-w-[860px] text-[clamp(34px,6.4vw,62px)] font-extrabold leading-[1] tracking-[-0.055em]">
          Setiap siswa berhak belajar dengan cara yang <span className="text-brand-600">paling ia pahami.</span>
        </h2>
        <ul className="mt-10 grid gap-3 md:mt-14 md:grid-cols-3 md:gap-4">
          {POINTS.map((p) => (
            <li key={p.title} className="js-why-point rounded-[26px] border border-brand-100 bg-brand-50 p-6 md:p-7">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-brand-600">
                <Icon name={p.icon} className="size-5" />
              </span>
              <h3 className="mt-5 text-[20px] font-extrabold leading-tight tracking-[-0.03em]">{p.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-brand-800">{p.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
