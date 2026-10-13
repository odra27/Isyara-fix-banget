import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE } from '../../animations/tokens';
import { HandSkeleton } from '../ui/HandSkeleton';
import { Icon } from '../ui/Icon';

export function TwoWay() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.js-feature', {
          y: 40,
          autoAlpha: 0,
          stagger: 0.12,
          duration: 0.7,
          ease: EASE.enter,
          scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="fitur" ref={root} className="pb-20 md:pb-32">
      <div className="wrap">
        <div className="mb-8 flex flex-col justify-between gap-4 md:mb-12 md:flex-row md:items-end">
          <h2 className="text-[clamp(36px,7vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]">
            Dua arah,
            <br />
            satu layar.
          </h2>
          <p className="max-w-[320px] text-[14px] leading-relaxed text-brand-600">
            Kedua alur berjalan di perangkat yang sama tanpa saling mengganggu. Saat suara dibacakan, mic berhenti
            mendengar dulu.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {/* Isyarat → suara */}
          <article className="js-feature relative overflow-hidden rounded-[28px] bg-brand-900 p-6 text-white md:p-8">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-brand-200">01 / PASIEN → PETUGAS</span>
            <div className="my-8 flex items-center gap-3 md:my-10" aria-hidden="true">
              <span className="grid size-20 place-items-center rounded-2xl bg-white/8 text-brand-200 md:size-24">
                <HandSkeleton className="h-14 md:h-16" dotClassName="fill-brand-900" />
              </span>
              <Icon name="arrowRight" className="size-5 shrink-0 text-brand-400" />
              <span className="rounded-2xl bg-white px-3.5 py-2.5 text-[14px] font-bold text-brand-900">Saya pusing</span>
              <Icon name="volume" className="size-6 shrink-0 text-brand-200" />
            </div>
            <h3 className="text-[28px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[34px]">Isyarat jadi teks dan suara.</h3>
            <p className="mt-3 max-w-[380px] text-[13.5px] leading-relaxed text-brand-100">
              Pasien mengisyaratkan ke kamera. ISYARA mengenali frasa yang tersedia, menampilkannya, lalu membacakannya
              agar petugas tidak perlu melihat layar.
            </p>
          </article>

          {/* Suara → isyarat */}
          <article className="js-feature relative overflow-hidden rounded-[28px] border border-line bg-tint p-6 md:p-8">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-brand-400">02 / PETUGAS → PASIEN</span>
            <div className="my-8 flex items-center gap-3 md:my-10" aria-hidden="true">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <Icon name="mic" className="size-5" />
              </span>
              <span className="min-w-0 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-[13px] font-semibold text-brand-800">
                “Kontrolnya kapan lagi ya?”
              </span>
              <Icon name="arrowRight" className="size-5 shrink-0 text-brand-400" />
              <span className="relative grid h-16 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-900 text-white md:h-20 md:w-16">
                <Icon name="play" className="size-5" fill="currentColor" />
                <span className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-white/25">
                  <span className="block h-full w-2/3 rounded-full bg-brand-200" />
                </span>
              </span>
            </div>
            <h3 className="text-[28px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[34px]">Suara jadi video isyarat.</h3>
            <p className="mt-3 max-w-[380px] text-[13.5px] leading-relaxed text-brand-600">
              Petugas bicara dengan kalimatnya sendiri. ISYARA mencari frasa dengan makna terdekat, lalu memutar video
              BISINDO rekaman asli beserta teksnya.
            </p>
          </article>

          {/* Auto-capture */}
          <article className="js-feature grid gap-6 rounded-[28px] border border-line bg-white p-6 md:col-span-2 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <span className="text-[11px] font-extrabold tracking-[0.12em] text-brand-400">03 / OTOMATIS</span>
              <h3 className="mt-3 text-[28px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[34px]">Kedua tangan tetap bebas.</h3>
              <p className="mt-3 max-w-[520px] text-[13.5px] leading-relaxed text-brand-600">
                Banyak isyarat BISINDO memakai dua tangan. Karena itu ISYARA mendeteksi sendiri kapan isyarat dimulai
                dan selesai. Tidak ada tombol yang harus ditekan dan ditahan.
              </p>
            </div>
            <div className="flex items-center gap-2 text-brand-600" aria-hidden="true">
              <HandSkeleton className="h-24 md:h-28" dotClassName="fill-white" />
              <HandSkeleton className="h-24 md:h-28" mirrored dotClassName="fill-white" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
