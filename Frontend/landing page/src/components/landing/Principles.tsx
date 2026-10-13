import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon, type IconName } from '../ui/Icon';

const ITEMS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'target',
    title: 'Bukan penerjemah umum',
    desc: 'Cakupannya jelas: frasa layanan Puskesmas. Untuk percakapan kompleks atau darurat, JBI manusia tetap yang utama.',
  },
  {
    icon: 'eyeOff',
    title: 'Rekaman pasien tidak disimpan',
    desc: 'Titik gerak tangan hanya ada di memori sementara dan dibuang setelah diproses.',
  },
  {
    icon: 'users',
    title: 'Divalidasi komunitas',
    desc: 'Kosakata dan video referensi disusun bersama komunitas Tuli dan JBI BISINDO.',
  },
  {
    icon: 'keyboard',
    title: 'Tetap jalan saat gangguan',
    desc: 'Kamera, mic, atau koneksi bermasalah? Sisi yang gagal beralih ke mode ketik manual.',
  },
];

export function Principles() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.js-principle', {
          y: 24,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.55,
          ease: EASE.enter,
          scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="py-20 md:py-28">
      <div className="wrap grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <h2 className="text-[clamp(36px,7vw,60px)] font-extrabold leading-[0.96] tracking-[-0.06em]">
          Jujur soal
          <br />
          <span className="text-muted">batasnya.</span>
        </h2>
        <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <li key={it.title} className="js-principle border-t border-line pt-5">
              <Icon name={it.icon} className="size-5 text-brand-600" />
              <h3 className="mt-3 text-[17px] font-extrabold tracking-[-0.02em]">{it.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{it.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
