import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';

// Contoh kosakata BISINDO yang dilatih pada model, dikelompokkan untuk konteks belajar.
const GROUPS = [
  { code: 'A', name: 'Sapaan', words: ['Halo', 'Apa kabar', 'Selamat pagi', 'Selamat siang', 'Terima kasih'] },
  { code: 'B', name: 'Pertanyaan', words: ['Apa', 'Bagaimana', 'Berapa', 'Kapan', 'Cari'] },
  { code: 'C', name: 'Di kelas', words: ['Belajar', 'Teman', 'Ingat', 'Hari', 'Saya', 'Kamu'] },
  { code: 'D', name: 'Perasaan & sehari-hari', words: ['Bingung', 'Baik', 'Rumah', 'Air', 'Tidur'] },
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
            Kosakata untuk
            <br />
            <span className="text-brand-200">kegiatan belajar.</span>
          </h2>
          <p className="max-w-[360px] text-[14px] leading-relaxed text-brand-100">
            Model kami mengenali kosakata BISINDO yang telah dilatih dan divalidasi. Lebih sedikit, tapi bisa
            diandalkan.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 md:mt-14 lg:grid-cols-5">
          {GROUPS.map((g) => (
            <div key={g.code} className="js-group rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-extrabold">{g.name}</h3>
                <span className="text-[11px] font-extrabold text-brand-200">{g.code}</span>
              </div>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {g.words.map((w) => (
                  <li key={w} className="rounded-full bg-white/[0.07] px-2.5 py-1.5 text-[12px] font-semibold text-brand-100">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="js-group rounded-3xl bg-brand-600 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">Di luar daftar?</h3>
              <span className="text-[11px] font-extrabold text-brand-100">E</span>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-white">
              Ketik saja. Jawaban chatbot tetap ditampilkan sebagai animasi isyarat, termasuk kata yang belum dilatih.
            </p>
          </div>
        </div>
        <p className="mt-6 text-[12px] text-brand-200">
          Contoh di atas sebagian dari kosakata terlatih, satu dialek BISINDO.
        </p>
      </div>
    </section>
  );
}
