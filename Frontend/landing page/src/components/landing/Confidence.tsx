import { useRef, type ReactNode } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon } from '../ui/Icon';

type Tier = {
  range: string;
  value: number;
  title: string;
  desc: string;
  bar: string;
  mock: ReactNode;
};

const TIERS: Tier[] = [
  {
    range: '≥ 85%',
    value: 92,
    title: 'Langsung tampil.',
    desc: 'Teks langsung muncul, lalu dibacakan untuk guru atau dikirim ke chatbot.',
    bar: 'bg-ok',
    mock: (
      <div className="flex items-center justify-between rounded-2xl bg-white p-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">Selamat pagi</span>
        <span className="flex items-center gap-1 text-[11px] font-bold text-ok-ink">
          <Icon name="check" className="size-3.5" /> Tampil
        </span>
      </div>
    ),
  },
  {
    range: '60–84%',
    value: 72,
    title: 'Dikonfirmasi dulu.',
    desc: 'Teks baru dikirim setelah siswa menekan Konfirmasi.',
    bar: 'bg-brand-400',
    mock: (
      <div className="rounded-2xl bg-white p-3.5">
        <span className="text-[10.5px] font-bold text-muted">Kemungkinan maksud · 72%</span>
        <p className="mt-0.5 text-[15px] font-extrabold tracking-tight">“Bingung”</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10.5px] font-bold">
          <span className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-white">
            <Icon name="check" className="size-3" /> Konfirmasi
          </span>
          <span className="flex items-center justify-center rounded-lg border border-line py-2 text-brand-800">Ulangi</span>
          <span className="flex items-center justify-center rounded-lg border border-line py-2 text-brand-800">Ketik</span>
        </div>
      </div>
    ),
  },
  {
    range: '< 60%',
    value: 40,
    title: 'Tidak menebak.',
    desc: 'ISYARA jujur bilang isyarat belum dikenali. Ulangi, atau ketik saja.',
    bar: 'bg-brand-200',
    mock: (
      <div className="rounded-2xl bg-white p-3.5">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand-800">
          <Icon name="help" className="size-4 text-muted" /> Isyarat belum dikenali
        </p>
        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-1.5 text-[10.5px] font-bold">
          <span className="js-retry-cta flex items-center justify-center gap-1 rounded-lg bg-brand-900 py-2 text-white">
            <Icon name="retry" className="size-3" /> Ulangi isyarat
          </span>
          <span className="flex items-center justify-center gap-1 rounded-lg border border-line py-2 text-brand-800">
            <Icon name="keyboard" className="size-3" /> Ketik saja
          </span>
        </div>
      </div>
    ),
  },
];

export function Confidence() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: '.js-tiers', start: 'top 75%', once: true } });
        tl.from('.js-tier', { y: 32, autoAlpha: 0, stagger: 0.12, duration: 0.6, ease: EASE.enter })
          .from('.js-meter', { scaleX: 0, stagger: 0.12, duration: 0.8, ease: EASE.enter }, 0.2)
          .fromTo('.js-retry-cta', { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, ease: EASE.loop }, '-=0.1');
      });
    },
    { scope: root },
  );

  return (
    <section id="keyakinan" ref={root} className="py-20 md:py-32">
      <div className="wrap">
        <div className="max-w-[760px]">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Prinsip utama</p>
          <h2 className="mt-3 text-[clamp(38px,8vw,72px)] font-extrabold leading-[0.95] tracking-[-0.06em]">
            Tidak yakin?
            <br />
            <span className="text-brand-600">Jangan menebak.</span>
          </h2>
          <p className="mt-5 max-w-[500px] text-[15px] leading-relaxed text-brand-800">
            Salah paham membuat belajar jadi tersendat. Karena itu setiap hasil pengenalan isyarat punya tingkat
            keyakinan, dan siswa selalu bisa memilih untuk mengetik.
          </p>
        </div>

        <div className="js-tiers mt-10 grid gap-3 md:mt-14 md:grid-cols-3 md:gap-4">
          {TIERS.map((t) => (
            <article key={t.range} className="js-tier flex flex-col rounded-[26px] border border-brand-100 bg-brand-50 p-5 md:p-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[30px] font-extrabold tracking-[-0.05em]">{t.range}</span>
                <span className="text-[11px] font-bold text-muted">keyakinan</span>
              </div>
              <div className="relative mt-3 h-2 rounded-full bg-white" aria-hidden="true">
                <span className={`js-meter block h-full origin-left rounded-full ${t.bar}`} style={{ width: `${t.value}%` }} />
                <span className="absolute left-[60%] top-[-3px] h-[14px] w-px bg-brand-200" />
                <span className="absolute left-[85%] top-[-3px] h-[14px] w-px bg-brand-200" />
              </div>
              <h3 className="mt-6 text-[22px] font-extrabold tracking-[-0.035em]">{t.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-brand-800">{t.desc}</p>
              <div className="mt-auto pt-6" aria-hidden="true">
                {t.mock}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
