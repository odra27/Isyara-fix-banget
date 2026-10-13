import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { LOGIN_URL, isValidAppUrl } from '../../config/links';
const STEPS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'school',
    title: 'Sekolah mendaftarkan siswa',
    desc: 'Akun siswa dibuat oleh sekolah memakai NIS. Siswa tidak perlu mendaftar sendiri.',
  },
  {
    icon: 'idCard',
    title: 'Siswa masuk dengan NIS',
    desc: 'Cukup NIS dan kata sandi, lalu langsung ke Beranda untuk belajar.',
  },
  {
    icon: 'lock',
    title: 'Riwayat chat tersimpan aman',
    desc: 'Yang disimpan hanya teks percakapan di akun siswa. Gambar kamera tidak pernah direkam.',
  },
];
export function ForSchools() {
  const root = useRef<HTMLElement>(null);
  const loginOk = isValidAppUrl(LOGIN_URL);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%', once: true } });
        tl.from('.js-school-step', { y: 24, autoAlpha: 0, stagger: 0.12, duration: 0.55, ease: EASE.enter })
          .from('.js-school-card', { y: 30, rotation: 2, autoAlpha: 0, duration: 0.7, ease: EASE.enter }, 0.15)
          .from('.js-school-field', { x: -10, autoAlpha: 0, stagger: 0.1, duration: 0.4, ease: EASE.enter }, 0.5);
      });
    },
    { scope: root },
  );
  return (
    <section id="sekolah" ref={root} className="py-20 md:py-28">
      <div className="wrap">
        <div className="grid gap-10 overflow-hidden rounded-[32px] bg-brand-50 p-6 md:grid-cols-[1.15fr_0.85fr] md:items-center md:gap-14 md:rounded-[40px] md:p-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-brand-600">
              <Icon name="school" className="size-3.5" />
              Untuk Sekolah
            </p>
            <h2 className="mt-4 text-[clamp(34px,6.4vw,58px)] font-extrabold leading-[0.98] tracking-[-0.055em]">
              Sekolah mendaftarkan,
              <br />
              <span className="text-brand-600">siswa tinggal belajar.</span>
            </h2>
            <ol className="mt-8 grid gap-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="js-school-step flex gap-4">
                  <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-brand-600">
                    <Icon name={s.icon} className="size-5" />
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-brand-600 text-[10px] font-extrabold text-white">
                      {i + 1}
                    </span>
                  </span>
                  <div>
                    <h3 className="text-[16px] font-extrabold tracking-[-0.02em]">{s.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-brand-800">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {/* Mock kartu masuk (dekoratif) + tautan masuk sungguhan di bawahnya */}
          <div>
            <div aria-hidden="true" className="js-school-card rounded-[26px] bg-white p-6 shadow-soft">
              <span className="text-[18px] font-extrabold tracking-[-0.03em]">Masuk</span>
              <span className="mt-1 block text-[12px] text-muted">Pakai akun dari sekolahmu.</span>
              <span className="js-school-field mt-5 block">
                <span className="text-[11px] font-bold text-brand-800">NIS</span>
                <span className="mt-1 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] font-semibold tabular-nums">
                  <Icon name="idCard" className="size-4 text-brand-400" /> 0012345678
                </span>
              </span>
              <span className="js-school-field mt-3 block">
                <span className="text-[11px] font-bold text-brand-800">Kata sandi</span>
                <span className="mt-1 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] tracking-[0.3em]">
                  <Icon name="lock" className="size-4 text-brand-400" /> ••••••••
                </span>
              </span>
              <span className="js-school-field mt-5 flex items-center justify-center rounded-xl bg-brand-600 py-3 text-[13px] font-bold text-white">
                Masuk
              </span>
            </div>
            {loginOk && (
              <a
                href={LOGIN_URL}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-brand-100 bg-white px-5 py-3 text-[14px] font-bold text-brand-800 transition hover:bg-brand-100"
              >
                Sudah punya NIS? Masuk sekarang
                <Icon name="arrowRight" className="size-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
