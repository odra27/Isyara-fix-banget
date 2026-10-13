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
    title: 'Langsung disampaikan.',
    desc: 'Teks tampil dan otomatis dibacakan untuk petugas.',
    bar: 'bg-ok',
    mock: (
      <div className="flex items-center justify-between rounded-2xl bg-white p-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">Saya ingin berobat</span>
        <span className="flex items-center gap-1 text-[11px] font-bold text-ok-ink">
          <Icon name="volume" className="size-3.5" /> Dibacakan
        </span>
      </div>
    ),
  },
  {
    range: '60–84%',
    value: 72,
    title: 'Dikonfirmasi dulu.',
    desc: 'Suara baru keluar setelah pasien menekan Konfirmasi.',
    bar: 'bg-brand-400',
    mock: (
      <div className="rounded-2xl bg-white p-3.5">
        <span className="text-[10.5px] font-bold text-muted">Kemungkinan maksud · 72%</span>
        <p className="mt-0.5 text-[15px] font-extrabold tracking-tight">“Saya butuh resep”</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10.5px] font-bold">
          <span className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-white">
            <Icon name="check" className="size-3" /> Konfirmasi
          </span>
          <span className="flex items-center justify-center rounded-lg border border-line py-2 text-brand-800">Coba lagi</span>
          <span className="flex items-center justify-center rounded-lg border border-line py-2 text-brand-800">Panggil JBI</span>
        </div>
      </div>
    ),
  },
  {
    range: '< 60%',
    value: 40,
    title: 'Tidak menebak.',
    desc: 'ISYARA jujur bilang tidak cocok dan menawarkan JBI manusia.',
    bar: 'bg-brand-200',
    mock: (
      <div className="rounded-2xl bg-white p-3.5">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand-800">
          <Icon name="help" className="size-4 text-muted" /> Tidak ada frasa yang cocok
        </p>
        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-1.5 text-[10.5px] font-bold">
          <span className="js-jbi-cta flex items-center justify-center gap-1 rounded-lg bg-brand-900 py-2 text-white">
            <Icon name="users" className="size-3" /> Panggil JBI
          </span>
          <span className="flex items-center justify-center rounded-lg border border-line py-2 text-brand-800">Coba lagi</span>
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
          .fromTo('.js-jbi-cta', { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, ease: EASE.loop }, '-=0.1');
      });
    },
    { scope: root },
  );

  return (
    <section id="jbi" ref={root} className="py-20 md:py-32">
      <div className="wrap">
        <div className="max-w-[760px]">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Prinsip utama</p>
          <h2 className="mt-3 text-[clamp(38px,8vw,72px)] font-extrabold leading-[0.95] tracking-[-0.06em]">
            Tidak yakin?
            <br />
            <span className="text-brand-600">Jangan menebak.</span>
          </h2>
          <p className="mt-5 max-w-[500px] text-[15px] leading-relaxed text-brand-600">
            Di layanan kesehatan, salah paham lebih berbahaya daripada mengaku ragu. Setiap hasil punya tingkat
            keyakinan, dan tombol Panggil JBI selalu ada di layar.
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
              <p className="mt-1.5 text-[13px] leading-relaxed text-brand-600">{t.desc}</p>
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
