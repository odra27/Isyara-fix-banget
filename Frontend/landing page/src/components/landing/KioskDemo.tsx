import { useRef, useState } from 'react';
import { gsap, ScrollTrigger, useGSAP, MOTION_OK, REDUCED } from '../../lib/gsap';
import { DEMO, EASE } from '../../animations/tokens';
import { HandSkeleton } from '../ui/HandSkeleton';
import { Icon } from '../ui/Icon';
import { LogoMark } from '../ui/Logo';

/**
 * Mockup kiosk yang memutar alur auto-capture PRD §9 secara berulang:
 * IDLE → HAND_DETECTED → RECORDING → (diam) → PROCESSING → RESULT_ACCEPT.
 * Satu timeline GSAP master, di-pause saat keluar viewport.
 */
type Phase = 'idle' | 'detected' | 'recording' | 'still' | 'processing' | 'result';

const PHASE_UI: Record<Phase, { pill: string; caption: string; dot: string }> = {
  idle: { pill: 'Siap', caption: 'Silakan mulai mengisyaratkan', dot: 'bg-ok' },
  detected: { pill: 'Tangan terbaca', caption: 'Tangan terdeteksi', dot: 'bg-brand-400' },
  recording: { pill: 'Merekam', caption: 'Merekam…', dot: 'bg-rec' },
  still: { pill: 'Merekam', caption: 'Diam sebentar untuk selesai', dot: 'bg-rec' },
  processing: { pill: 'Memproses', caption: 'Memproses…', dot: 'bg-brand-400' },
  result: { pill: 'Tersampaikan', caption: 'Dibacakan untuk petugas', dot: 'bg-ok' },
};

const PHRASES = [
  { text: 'Saya ingin berobat', conf: 94 },
  { text: 'Saya demam', conf: 92 },
  { text: 'Saya butuh resep', conf: 89 },
] as const;

const RING_R = 11;
const RING_LEN = 2 * Math.PI * RING_R;

export function KioskDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [idx, setIdx] = useState(0);
  const phrase = PHRASES[idx];
  const ui = PHASE_UI[phase];

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      mm.add({ motion: MOTION_OK, reduced: REDUCED }, (ctx) => {
        const reduced = Boolean(ctx.conditions?.reduced);

        const revealWords = () => {
          const words = q('[data-word]');
          gsap.fromTo(
            words,
            { yPercent: reduced ? 0 : 110, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 0.45, stagger: 0.07, ease: EASE.enter },
          );
          gsap.fromTo(q('.js-conf-fill'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: EASE.enter, delay: 0.15 });
        };

        const tl = gsap.timeline({
          repeat: -1,
          paused: true,
          onRepeat: () => {
            setIdx((i) => (i + 1) % PHRASES.length);
            setPhase('idle');
          },
        });

        const tDetected = DEMO.idle;
        const tRecording = tDetected + DEMO.detected;
        const tStill = tRecording + DEMO.recording;
        const tProcessing = tStill + DEMO.still;
        const tResult = tProcessing + DEMO.processing;
        const tReset = tResult + DEMO.result;

        // Kondisi awal (juga tujuan akhir segmen reset → loop mulus).
        tl.set(q('.js-hands'), { autoAlpha: 0 }, 0)
          .set(q('.js-brackets'), { scale: 1.1, autoAlpha: 0.35 }, 0)
          .set(q('.js-rec-frame'), { autoAlpha: 0 }, 0)
          .set(q('.js-progress'), { scaleX: 0 }, 0)
          .set(q('.js-ring-wrap'), { autoAlpha: 0 }, 0)
          .set(q('.js-ring'), { strokeDashoffset: RING_LEN }, 0)
          .set(q('.js-panel-proc, .js-panel-result'), { autoAlpha: 0 }, 0)
          .set(q('.js-panel-idle'), { autoAlpha: 1 }, 0);

        // IDLE: ikon tangan "bernapas".
        if (!reduced) {
          tl.to(q('.js-breath'), { scale: 1.1, duration: DEMO.idle / 2, yoyo: true, repeat: 1, ease: EASE.loop }, 0);
        }

        // HAND_DETECTED: landmark muncul, bingkai mengunci (belum merah).
        tl.call(() => setPhase('detected'), [], tDetected)
          .to(q('.js-hands'), { autoAlpha: 1, duration: 0.25 }, tDetected)
          .fromTo(
            q('.js-dot'),
            { scale: reduced ? 1 : 0 },
            { scale: 1, duration: 0.25, stagger: 0.006, ease: EASE.pop, transformOrigin: '50% 50%' },
            tDetected,
          )
          .to(q('.js-brackets'), { scale: 1, autoAlpha: 1, duration: 0.2, ease: EASE.enter }, tDetected);

        // RECORDING: bingkai merah, pulse pelan (siklus 1.3 dtk), progres menuju batas 8 dtk.
        tl.call(() => setPhase('recording'), [], tRecording)
          .to(q('.js-rec-frame'), { autoAlpha: 1, duration: 0.3 }, tRecording)
          .to(
            q('.js-progress'),
            { scaleX: (DEMO.recording + DEMO.still) / DEMO.maxRecord, duration: DEMO.recording + DEMO.still, ease: 'none' },
            tRecording,
          );
        if (!reduced) {
          tl.to(
            q('.js-rec-frame'),
            { opacity: 0.35, duration: DEMO.pulseHalf, yoyo: true, repeat: 2, ease: EASE.loop },
            tRecording + 0.3,
          )
            .to(q('.js-hand-l'), { x: 16, y: -20, rotation: -12, duration: 0.65, yoyo: true, repeat: 3, ease: EASE.loop }, tRecording)
            .to(q('.js-hand-r'), { x: -12, y: 14, rotation: 9, duration: 0.52, yoyo: true, repeat: 4, ease: EASE.loop }, tRecording);
        }

        // Diam: ring mengisi selama ambang diam, tanda sistem akan berhenti.
        tl.call(() => setPhase('still'), [], tStill)
          .to(q('.js-hand-l, .js-hand-r'), { x: 0, y: 0, rotation: 0, duration: 0.35, ease: EASE.enter }, tStill)
          .to(q('.js-rec-frame'), { opacity: 1, duration: 0.3 }, tStill)
          .to(q('.js-ring-wrap'), { autoAlpha: 1, duration: 0.2 }, tStill)
          .to(q('.js-ring'), { strokeDashoffset: 0, duration: DEMO.still, ease: 'none' }, tStill);

        // PROCESSING
        tl.call(() => setPhase('processing'), [], tProcessing)
          .to(q('.js-rec-frame'), { autoAlpha: 0, duration: 0.3 }, tProcessing)
          .to(q('.js-ring-wrap'), { autoAlpha: 0, duration: 0.2 }, tProcessing)
          .to(q('.js-hands'), { autoAlpha: 0.25, duration: 0.3 }, tProcessing)
          .to(q('.js-panel-idle'), { autoAlpha: 0, duration: 0.2 }, tProcessing)
          .to(q('.js-panel-proc'), { autoAlpha: 1, duration: 0.2 }, tProcessing);
        if (!reduced) {
          tl.fromTo(q('.js-spinner'), { rotation: 0 }, { rotation: 540, duration: DEMO.processing, ease: 'none' }, tProcessing);
        }

        // RESULT_ACCEPT: kata muncul bertahap + gelombang "sedang dibacakan".
        tl.call(
          () => {
            setPhase('result');
            revealWords();
          },
          [],
          tResult,
        )
          .to(q('.js-panel-proc'), { autoAlpha: 0, duration: 0.2 }, tResult)
          .to(q('.js-panel-result'), { autoAlpha: 1, duration: 0.25 }, tResult);
        if (!reduced) {
          tl.fromTo(
            q('.js-wave i'),
            { scaleY: 1 },
            { scaleY: 0.3, duration: 0.35, yoyo: true, repeat: 5, stagger: 0.08, ease: EASE.loop },
            tResult + 0.5,
          );
        }

        // Reset senyap ke IDLE.
        tl.to(q('.js-panel-result'), { autoAlpha: 0, duration: 0.3 }, tReset)
          .to(q('.js-panel-idle'), { autoAlpha: 1, duration: 0.3 }, tReset + 0.15)
          .to(q('.js-hands'), { autoAlpha: 0, duration: 0.25 }, tReset)
          .to(q('.js-brackets'), { scale: 1.1, autoAlpha: 0.35, duration: 0.3 }, tReset)
          .to(q('.js-progress'), { scaleX: 0, duration: 0.3 }, tReset)
          .set(q('.js-ring'), { strokeDashoffset: RING_LEN }, tReset + 0.3)
          .to({}, { duration: 0.4 }, tReset + 0.3);

        const st = ScrollTrigger.create({
          trigger: root.current,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
        });
        if (st.isActive) tl.play();
      });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      role="img"
      aria-label="Ilustrasi kiosk ISYARA: kamera membaca isyarat pasien, merekam, memproses, lalu menampilkan dan membacakan frasa untuk petugas."
      className="relative mx-auto w-[min(74vw,292px)] md:w-[300px] lg:w-[318px]"
    >
      <div aria-hidden="true" className="relative rounded-[42px] border-[7px] border-brand-900 bg-white p-2.5 shadow-phone">
        <div className="mx-auto mb-2 h-[18px] w-[88px] rounded-full bg-brand-900" />

        {/* Header aplikasi */}
        <div className="flex items-center justify-between px-1 pb-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.12em]">
            <LogoMark className="size-6" />
            ISYARA
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-tint px-2 py-1 text-[9.5px] font-bold text-brand-800">
            <span className={`size-1.5 rounded-full ${ui.dot}`} />
            {ui.pill}
          </span>
        </div>

        {/* Area kamera */}
        <div className="relative aspect-[4/4.35] overflow-hidden rounded-[24px] bg-gradient-to-br from-brand-100 via-brand-50 to-white">
          <svg viewBox="0 0 200 218" className="absolute inset-x-0 bottom-0 w-full" aria-hidden="true">
            <circle cx="100" cy="72" r="31" className="fill-brand-200" />
            <path d="M22 218c0-62 34-92 78-92s78 30 78 92Z" className="fill-brand-200/80" />
          </svg>

          <div className="js-hands absolute inset-0">
            <div className="js-hand-l absolute bottom-[14%] left-[9%] w-[34%] text-brand-600">
              <HandSkeleton className="w-full" />
            </div>
            <div className="js-hand-r absolute bottom-[20%] right-[9%] w-[31%] text-brand-600">
              <HandSkeleton className="w-full" mirrored />
            </div>
          </div>

          {/* Bingkai kunci */}
          <div className="js-brackets absolute inset-4 text-brand-600">
            {['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl', 'left-0 bottom-12 border-l-[3px] border-b-[3px] rounded-bl-xl', 'right-0 bottom-12 border-r-[3px] border-b-[3px] rounded-br-xl'].map((c) => (
              <span key={c} className={`absolute size-6 border-current ${c}`} />
            ))}
          </div>

          <div className="js-rec-frame pointer-events-none absolute inset-0 rounded-[24px] border-[3px] border-rec shadow-[inset_0_0_24px_rgba(214,69,69,0.25)]" />
          <div className="js-progress absolute left-0 right-0 top-0 h-1 origin-left bg-rec" />

          <div className="js-ring-wrap absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 py-1 pl-1 pr-2 text-[9px] font-bold text-brand-800">
            <svg viewBox="0 0 28 28" className="size-5 -rotate-90">
              <circle cx="14" cy="14" r={RING_R} className="fill-none stroke-brand-100" strokeWidth="3" />
              <circle
                cx="14"
                cy="14"
                r={RING_R}
                className="js-ring fill-none stroke-rec"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_LEN}
                strokeDashoffset={RING_LEN}
              />
            </svg>
            Selesai?
          </div>

          <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-brand-900/85 px-2 py-2 text-[10px] font-semibold text-white">
            {phase === 'recording' || phase === 'still' ? (
              <span className="size-1.5 rounded-full bg-rec" />
            ) : (
              <Icon name="hand" className="size-3" />
            )}
            {ui.caption}
          </div>
        </div>

        {/* Panel hasil (state-dependent) */}
        <div className="relative mt-3 h-[122px] px-1.5">
          <div className="js-panel-idle absolute inset-x-1.5 top-0">
            <div className="flex items-start justify-between">
              <p className="text-[21px] font-extrabold leading-[1.02] tracking-[-0.045em]">
                Mulai
                <br />
                berkomunikasi.
              </p>
              <span className="js-breath grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Icon name="hand" className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-[10px] text-muted">Gerakan terdeteksi otomatis. Tidak perlu menekan tombol.</p>
          </div>

          <div className="js-panel-proc invisible absolute inset-x-1.5 top-2 flex items-center gap-3">
            <span className="js-spinner block size-8 rounded-full border-[3px] border-brand-100 border-t-brand-600" />
            <span>
              <span className="block text-[14px] font-extrabold tracking-tight">Memproses…</span>
              <span className="block text-[10px] text-muted">Mencocokkan dengan frasa tervalidasi</span>
            </span>
          </div>

          <div className="js-panel-result invisible absolute inset-x-1.5 top-0">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted">Pasien menyampaikan</span>
            <p key={phrase.text} className="mt-1 text-[21px] font-extrabold leading-[1.05] tracking-[-0.045em]">
              {phrase.text.split(' ').map((w, i) => (
                <span key={i} className="mr-[0.22em] inline-block overflow-hidden pb-0.5 align-bottom">
                  <span data-word className="inline-block">
                    {w}
                  </span>
                </span>
              ))}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-50">
                <span className="js-conf-fill block h-full origin-left rounded-full bg-ok" style={{ width: `${phrase.conf}%` }} />
              </span>
              <span className="text-[10px] font-bold text-ok-ink">{phrase.conf}%</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-brand-800">
              <span className="js-wave flex h-3.5 items-center gap-[2px]">
                {[6, 12, 16, 9, 13, 7].map((h, i) => (
                  <i key={i} className="block w-[2px] origin-center rounded-full bg-brand-400" style={{ height: h }} />
                ))}
              </span>
              Dibacakan untuk petugas
            </div>
          </div>
        </div>

        {/* Aksi yang selalu ada */}
        <div className="grid grid-cols-2 gap-1.5">
          <span className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line text-[10px] font-bold text-brand-800">
            <Icon name="retry" className="size-3" />
            Ulangi isyarat
          </span>
          <span className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-900 text-[10px] font-bold text-white">
            <Icon name="users" className="size-3" />
            Panggil JBI
          </span>
        </div>
      </div>
    </div>
  );
}
