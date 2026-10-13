import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon } from '../ui/Icon';
// Contoh topik per mata pelajaran; ilustrasi isi Beranda, bukan daftar materi lengkap.
const SUBJECTS = [
  { name: 'Matematika', topic: 'Pecahan dan persentase', tone: 'bg-brand-600 text-white' },
  { name: 'Bahasa Indonesia', topic: 'Membaca cerita pendek', tone: 'bg-brand-100 text-brand-900' },
  { name: 'IPA', topic: 'Siklus air', tone: 'bg-brand-900 text-white' },
  { name: 'IPS', topic: 'Lingkungan sekitar rumah', tone: 'bg-brand-200 text-brand-900' },
  { name: 'Bahasa Inggris', topic: 'Greetings: Halo dan Apa kabar', tone: 'bg-brand-400 text-white' },
];
export function Materi() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 72%', once: true } });
        tl.from('.js-filter', { y: 10, autoAlpha: 0, stagger: 0.05, duration: 0.35, ease: EASE.enter }).from(
          '.js-subject',
          { y: 30, autoAlpha: 0, stagger: 0.09, duration: 0.55, ease: EASE.enter },
          '-=0.15',
        );
      });
    },
    { scope: root },
  );
  return (
    <section id="materi" ref={root} className="bg-tint py-20 md:py-28">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Beranda siswa</p>
            <h2 className="mt-3 text-[clamp(36px,7vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]">
              Materi per
              <br />
              mata pelajaran.
            </h2>
          </div>
          <p className="max-w-[360px] text-[14px] leading-relaxed text-brand-800">
            Setelah masuk, siswa langsung melihat materi. Pilih mata pelajaran, lalu tonton video pelajaran berbahasa
            isyarat lengkap dengan teks dan audio.
          </p>
        </div>
        <ul aria-hidden="true" className="mt-10 flex flex-wrap gap-2 md:mt-12">
          {['Semua', ...SUBJECTS.map((s) => s.name)].map((f, i) => (
            <li
              key={f}
              className={`js-filter rounded-full px-3.5 py-2 text-[12.5px] font-bold ${
                i === 0 ? 'bg-brand-600 text-white' : 'border border-line bg-white text-brand-800'
              }`}
            >
              {f}
            </li>
          ))}
        </ul>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SUBJECTS.map((s) => (
            <li key={s.name} className="js-subject flex flex-col overflow-hidden rounded-[24px] border border-line bg-white">
              <div className={`relative flex aspect-[16/10] items-center justify-center ${s.tone}`} aria-hidden="true">
                <span className="grid size-11 place-items-center rounded-full bg-white/25 backdrop-blur">
                  <Icon name="play" className="size-4" fill="currentColor" />
                </span>
                <span className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[9.5px] font-extrabold tracking-[0.06em] text-brand-800">
                  BISINDO
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-[15px] font-extrabold tracking-[-0.02em]">{s.name}</h3>
                <p className="mt-1 text-[12.5px] leading-snug text-muted">{s.topic}</p>
                <p className="mt-auto flex gap-3 pt-4 text-[11px] font-bold text-brand-600">
                  <span className="flex items-center gap-1">
                    <Icon name="hand" className="size-3.5" /> Isyarat
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="captions" className="size-3.5" /> Teks
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="volume" className="size-3.5" /> Audio
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
