import { useRef, useState } from 'react';
import { gsap, ScrollTrigger, useGSAP, MOTION_OK } from '../../lib/gsap';
import { EASE, TABLET } from '../../animations/tokens';
import { HandSkeleton } from '../ui/HandSkeleton';
import { Icon } from '../ui/Icon';
import { LogoMark } from '../ui/Logo';
/**
 * Mockup tablet di hero: video materi berbahasa isyarat (avatar placeholder) + panel langkah.
 * Sorotan langkah berputar Evaporasi → Infiltrasi, float & gerak tangan avatar berulang.
 * Semua loop di-pause saat keluar viewport; versi reduced-motion statis di langkah pertama.
 */
const STEPS = [
  { name: 'Evaporasi', hint: 'Air menguap', caption: 'Hari ini kita akan belajar tentang siklus air.' },
  { name: 'Kondensasi', hint: 'Uap jadi awan', caption: 'Uap air mendingin, lalu menjadi awan.' },
  { name: 'Presipitasi', hint: 'Hujan turun', caption: 'Awan yang berat menurunkan hujan.' },
  { name: 'Infiltrasi', hint: 'Air meresap', caption: 'Air hujan meresap ke dalam tanah.' },
] as const;
export function TabletDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const hold = TABLET.stepHold;
        const tl = gsap.timeline({ repeat: -1, paused: true });
        STEPS.forEach((_, i) => {
          const at = i * hold;
          tl.call(
            () => {
              setActive(i);
              gsap.fromTo(q('.js-caption'), { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: EASE.enter });
              gsap.fromTo(q(`.js-step-dot-${i}`), { scale: 0.6 }, { scale: 1, duration: 0.45, ease: EASE.pop });
            },
            [],
            at,
          );
        });
        // Progres video bergerak linear sepanjang satu putaran langkah.
        tl.fromTo(q('.js-video-progress'), { scaleX: 0.08 }, { scaleX: 1, duration: hold * STEPS.length, ease: 'none' }, 0);
        const loops: gsap.core.Animation[] = [
          tl,
          gsap.to(q('.js-tablet'), { y: -10, duration: TABLET.floatHalf, yoyo: true, repeat: -1, ease: EASE.loop, paused: true }),
          gsap.to(q('.js-av-hand-l'), {
            x: 6,
            y: -10,
            rotation: -10,
            duration: TABLET.signHalf,
            yoyo: true,
            repeat: -1,
            ease: EASE.loop,
            paused: true,
          }),
          gsap.to(q('.js-av-hand-r'), {
            x: -5,
            y: 7,
            rotation: 8,
            duration: TABLET.signHalf * 0.85,
            yoyo: true,
            repeat: -1,
            ease: EASE.loop,
            paused: true,
          }),
        ];
        const st = ScrollTrigger.create({
          trigger: root.current,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => loops.forEach((a) => (self.isActive ? a.play() : a.pause())),
        });
        if (st.isActive) loops.forEach((a) => a.play());
        return () => setActive(0);
      });
    },
    { scope: root },
  );
  const step = STEPS[active];
  return (
    <div
      ref={root}
      role="img"
      aria-label="Ilustrasi tablet ISYARA: video materi IPA tentang siklus air dengan avatar yang memperagakan bahasa isyarat BISINDO, teks subtitle, dan panel langkah Evaporasi, Kondensasi, Presipitasi, Infiltrasi."
      className="relative mx-auto w-full max-w-[560px]"
    >
      <div aria-hidden="true" className="js-tablet relative rounded-[30px] bg-brand-900 p-2 shadow-phone sm:rounded-[34px] sm:p-2.5">
        {/* Kamera depan tablet */}
        <span className="absolute left-1/2 top-[3px] size-1.5 -translate-x-1/2 rounded-full bg-brand-600 sm:top-1" />
        <div className="rounded-[22px] bg-white p-2.5 sm:rounded-[26px] sm:p-4">
          {/* Bar atas aplikasi */}
          <div className="flex items-center justify-between gap-2 pb-2.5 sm:pb-3.5">
            <span className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.12em] sm:text-[11px]">
              <LogoMark className="size-5 sm:size-6" />
              ISYARA
            </span>
            <span className="flex gap-1 text-[8.5px] font-bold sm:text-[9.5px]">
              <span className="rounded-full bg-brand-600 px-2 py-1 text-white">IPA</span>
              <span className="rounded-full bg-tint px-2 py-1 text-brand-800">Matematika</span>
              <span className="hidden rounded-full bg-tint px-2 py-1 text-brand-800 sm:inline">B. Indonesia</span>
            </span>
          </div>
          <div className="grid grid-cols-[1.55fr_1fr] gap-2 sm:gap-3">
            {/* Area video */}
            <div>
              <div className="relative aspect-[4/3.4] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 via-brand-50 to-white">
                {/* Papan tulis kecil di latar */}
                <span className="absolute right-[8%] top-[12%] h-[22%] w-[26%] rounded-md border-2 border-brand-200 bg-white/70" />
                <span className="absolute right-[12%] top-[18%] h-[3%] w-[16%] rounded-full bg-brand-200" />
                <span className="absolute right-[12%] top-[24%] h-[3%] w-[11%] rounded-full bg-brand-200" />
                {/* Avatar placeholder */}
                <svg viewBox="0 0 240 200" className="absolute inset-x-0 bottom-0 w-full">
                  <path d="M58 200c0-50 28-74 62-74s62 24 62 74Z" className="fill-brand-600" />
                  <path d="M104 126h32l-16 22Z" className="fill-brand-50" />
                  <rect x="110" y="104" width="20" height="24" rx="8" className="fill-brand-200" />
                  <circle cx="120" cy="80" r="30" className="fill-brand-200" />
                  <path d="M89 78c0-22 14-34 31-34s31 12 31 34c-6-10-18-15-31-15s-25 5-31 15Z" className="fill-brand-800" />
                  <circle cx="109" cy="84" r="3" className="fill-brand-900" />
                  <circle cx="131" cy="84" r="3" className="fill-brand-900" />
                  <path d="M111 95c5 5 13 5 18 0" className="fill-none stroke-brand-900" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
                <div className="js-av-hand-l absolute bottom-[6%] left-[17%] w-[24%] text-brand-900">
                  <HandSkeleton className="w-full" dotClassName="fill-brand-50" />
                </div>
                <div className="js-av-hand-r absolute bottom-[10%] right-[17%] w-[21%] text-brand-900">
                  <HandSkeleton className="w-full" mirrored dotClassName="fill-brand-50" />
                </div>
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-brand-900/85 px-2 py-1 text-[8.5px] font-bold tabular-nums text-white sm:text-[10px]">
                  <Icon name="play" className="size-2.5" fill="currentColor" />
                  00:45
                </span>
                <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[8px] font-extrabold tracking-[0.08em] text-brand-800 sm:text-[9px]">
                  BISINDO
                </span>
                <p className="js-caption absolute inset-x-2 bottom-2 rounded-lg bg-brand-900/85 px-2 py-1.5 text-center text-[8.5px] font-semibold leading-snug text-white sm:text-[11px]">
                  {step.caption}
                </p>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-50">
                <span
                  className="js-video-progress block h-full w-full origin-left rounded-full bg-brand-600"
                  style={{ transform: 'scaleX(0.3)' }}
                />
              </div>
              <div className="mt-2 flex gap-1 text-[8.5px] font-bold text-brand-800 sm:text-[10px]">
                <span className="flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1">
                  <Icon name="hand" className="size-3" /> Isyarat
                </span>
                <span className="flex items-center gap-1 rounded-lg border border-line px-2 py-1">
                  <Icon name="captions" className="size-3" /> Teks
                </span>
                <span className="flex items-center gap-1 rounded-lg border border-line px-2 py-1">
                  <Icon name="volume" className="size-3" /> Audio
                </span>
              </div>
            </div>
            {/* Panel langkah */}
            <div className="flex flex-col rounded-2xl bg-tint p-2 sm:p-3">
              <span className="text-[7.5px] font-bold uppercase tracking-[0.12em] text-muted sm:text-[9px]">IPA · Kelas 5</span>
              <span className="mt-0.5 text-[12px] font-extrabold tracking-tight sm:text-[16px]">Siklus Air</span>
              <ol className="mt-2 flex flex-1 flex-col gap-1 sm:mt-3 sm:gap-1.5">
                {STEPS.map((s, i) => {
                  const on = i === active;
                  return (
                    <li
                      key={s.name}
                      className={`flex items-center gap-1.5 rounded-xl px-1.5 py-1.5 transition-colors duration-300 sm:gap-2 sm:px-2 sm:py-2 ${
                        on ? 'bg-brand-600 text-white shadow-[0_6px_14px_rgba(83,74,183,0.3)]' : 'bg-white text-brand-900'
                      }`}
                    >
                      <span
                        className={`js-step-dot-${i} grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-extrabold sm:size-5 sm:text-[9px] ${
                          on ? 'bg-white text-brand-600' : 'bg-brand-50 text-brand-600'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[9px] font-bold sm:text-[11.5px]">{s.name}</span>
                        <span className={`hidden text-[8.5px] sm:block ${on ? 'text-brand-100' : 'text-muted'}`}>{s.hint}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
