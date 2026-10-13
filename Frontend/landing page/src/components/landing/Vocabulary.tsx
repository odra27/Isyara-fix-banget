import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';

// Kosakata dari PRD §7, disusun mengikuti alur percakapan di Puskesmas.
const GROUPS = [
  { code: 'A', name: 'Pendaftaran', phrases: ['Saya ingin berobat', 'Saya punya janji', 'Saya ingin bertemu dokter'] },
  { code: 'B', name: 'Keluhan', phrases: ['Saya sakit di sini', 'Sudah berapa hari?', 'Saya demam', 'Saya batuk', 'Saya pusing'] },
  { code: 'C', name: 'Obat', phrases: ['Saya alergi obat ini', 'Saya butuh resep', 'Cara minumnya bagaimana?'] },
  { code: 'D', name: 'Administrasi', phrases: ['Kapan kontrol berikutnya?', 'Di mana ruang obat?'] },
  { code: 'E', name: 'Selalu tersedia', phrases: ['Saya tidak mengerti', 'Tolong ulangi', 'Panggil JBI'] },
];

export function Vocabulary() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.js-group', {
          y: 24,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.55,
          ease: EASE.enter,
          scrollTrigger: { trigger: root.current, start: 'top 70%', once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="kosakata" ref={root} className="bg-brand-950 py-20 text-white md:py-28">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h2 className="text-[clamp(36px,7vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]">
            Frasa yang
            <br />
            <span className="text-brand-200">benar-benar dipakai.</span>
          </h2>
          <p className="max-w-[360px] text-[14px] leading-relaxed text-brand-100">
            ISYARA mengenali sejumlah frasa BISINDO yang telah divalidasi untuk layanan Puskesmas. Lebih sedikit, tapi
            bisa diandalkan.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 md:mt-14 lg:grid-cols-5">
          {GROUPS.map((g) => (
            <div
              key={g.code}
              className={`js-group rounded-3xl p-5 ${g.code === 'E' ? 'bg-brand-600' : 'border border-white/10 bg-white/[0.04]'}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-extrabold">{g.name}</h3>
                <span className="text-[11px] font-extrabold text-brand-200">{g.code}</span>
              </div>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {g.phrases.map((p) => (
                  <li
                    key={p}
                    className={`rounded-full px-2.5 py-1.5 text-[12px] font-semibold ${g.code === 'E' ? 'bg-white/15 text-white' : 'bg-white/[0.07] text-brand-100'}`}
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[12px] text-brand-200">
          Demo memakai 5–10 frasa. Versi produk menargetkan 30–50 frasa, satu dialek BISINDO.
        </p>
      </div>
    </section>
  );
}
