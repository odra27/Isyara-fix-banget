import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Maskot ISYARA: anak harimau bertopi biru, tas merah, membawa buku pelangi (ilustrasi flat).
 * Empat keadaan (ADR-053):
 *  1. Ikut kursor   kepala miring sedikit + mata melirik ke kursor / titik sentuh terakhir; sesekali berkedip.
 *  2. Menyapa       melambai dua kali saat pertama muncul.
 *  3. Ikut chat     mood 'typing' = melihat ke kolom pesan; 'thinking' = melirik ke atas + titik "berpikir".
 *  4. Diklik        reaksi bergantian: lompat (topi terangkat), berputar, tersipu. Bisa lewat Enter/Spasi.
 * Lambaian ini sapaan biasa, BUKAN isyarat BISINDO. prefers-reduced-motion: semua gerak mati.
 */
export type MascotMood = 'idle' | 'typing' | 'thinking';
type Reaction = 'jump' | 'spin' | 'shy';
const REACTIONS: Reaction[] = ['jump', 'spin', 'shy'];

const ORANGE = '#F28A2E';
const ORANGE_DARK = '#D9711C';
const STRIPE = '#3A2416';
const CREAM = '#FFF6EA';
const PINK = '#F4A3A8';
const BLUE = '#3B7DD8';
const BLUE_DARK = '#2C63B3';
const RED = '#D9443B';
const RED_DARK = '#B5332C';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function TigerMascot({ mood = 'idle', size = 'lg', className }: { mood?: MascotMood; size?: 'lg' | 'sm'; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const body = useAnimationControls();
  const arm = useAnimationControls();
  const cap = useAnimationControls();
  const [blink, setBlink] = useState(false);
  const [shy, setShy] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);
  const reaction = useRef(0);
  const busy = useRef(false);

  const eyeX = useSpring(0, { stiffness: 220, damping: 22 });
  const eyeY = useSpring(0, { stiffness: 220, damping: 22 });
  const headRot = useSpring(0, { stiffness: 120, damping: 16 });
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // ---- 2. menyapa sekali saat muncul
  useEffect(() => {
    if (reduced) return;
    void arm.start({ rotate: [0, -26, 6, -26, 6, 0], transition: { duration: 1.6, delay: 0.35, ease: 'easeInOut' } });
  }, [arm, reduced]);

  // ---- kedip sesekali
  useEffect(() => {
    if (reduced) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        loop();
      }, 2800 + Math.random() * 2600);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [reduced]);

  // ---- 1 & 3. arah pandang
  const aim = useCallback(() => {
    if (mood === 'typing') {
      eyeX.set(0);
      eyeY.set(3.4);
      headRot.set(0);
      return;
    }
    if (mood === 'thinking') {
      eyeX.set(2.6);
      eyeY.set(-3.2);
      headRot.set(4);
      return;
    }
    const el = ref.current;
    const p = pointer.current;
    if (!el || !p) {
      eyeX.set(0);
      eyeY.set(0);
      headRot.set(0);
      return;
    }
    const r = el.getBoundingClientRect();
    const dx = p.x - (r.left + r.width / 2);
    const dy = p.y - (r.top + r.height * 0.35);
    eyeX.set(clamp(dx / 90, -1, 1) * 3.6);
    eyeY.set(clamp(dy / 90, -1, 1) * 3);
    headRot.set(clamp(dx / 260, -1, 1) * 8);
  }, [mood, eyeX, eyeY, headRot]);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), aim()));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    aim();
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      cancelAnimationFrame(raf);
    };
  }, [aim, reduced]);

  // ---- 4. diklik
  const react = async () => {
    if (reduced || busy.current) return;
    busy.current = true;
    const kind = REACTIONS[reaction.current++ % REACTIONS.length];
    setMouthOpen(true);
    if (kind === 'jump') {
      await Promise.all([
        body.start({ y: [0, -26, 0, -6, 0], transition: { duration: 0.75, ease: 'easeOut' } }),
        cap.start({ y: [0, -14, 0], rotate: [0, -12, 0], transition: { duration: 0.75, ease: 'easeOut' } }),
      ]);
    } else if (kind === 'spin') {
      await body.start({ rotate: [0, 360], transition: { duration: 0.8, ease: [0.6, 0, 0.3, 1] } });
      body.set({ rotate: 0 });
    } else {
      setShy(true);
      await body.start({ scaleY: [1, 0.92, 1.05, 1], scaleX: [1, 1.06, 0.97, 1], transition: { duration: 0.6 } });
      window.setTimeout(() => setShy(false), 900);
    }
    setMouthOpen(false);
    busy.current = false;
  };

  const lg = size === 'lg';

  return (
    <button
      ref={ref}
      type="button"
      onClick={react}
      aria-label="Maskot ISYARA. Ketuk untuk menyapa."
      className={cn(
        'group relative block shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-4 focus-visible:ring-brand-200',
        lg ? 'h-[8.5rem] w-[7.25rem]' : 'h-14 w-12',
        className,
      )}
    >
      <motion.div
        animate={body}
        className="size-full origin-bottom"
        whileHover={reduced ? undefined : { rotate: [0, -3, 3, -2, 0], transition: { duration: 0.5 } }}
      >
        <svg viewBox="0 0 220 260" className="size-full overflow-visible" aria-hidden="true">
          {/* bayangan */}
          <ellipse cx="110" cy="252" rx="54" ry="6" fill="#26215C" opacity="0.08" />

          {/* ekor */}
          <motion.g
            style={{ originX: 0, originY: 1 }}
            animate={reduced ? undefined : { rotate: [-6, 8, -6] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M150 200 C 182 198, 196 176, 190 150" stroke={ORANGE} strokeWidth="13" strokeLinecap="round" fill="none" />
            <path d="M172 194 l6 -8 M186 176 l8 -3" stroke={STRIPE} strokeWidth="4" strokeLinecap="round" />
            <circle cx="190" cy="148" r="8" fill={STRIPE} />
          </motion.g>

          {/* tas (di belakang badan) */}
          <rect x="56" y="128" width="108" height="82" rx="24" fill={RED} />
          <rect x="132" y="150" width="34" height="40" rx="10" fill={RED_DARK} />

          {/* kaki + sepatu */}
          <rect x="86" y="200" width="20" height="38" rx="9" fill={ORANGE} />
          <rect x="114" y="200" width="20" height="38" rx="9" fill={ORANGE} />
          <ellipse cx="94" cy="242" rx="17" ry="9" fill={BLUE} />
          <ellipse cx="128" cy="242" rx="17" ry="9" fill={BLUE} />
          <path d="M78 247 h32 M112 247 h32" stroke="#fff" strokeWidth="3" strokeLinecap="round" />

          {/* badan */}
          <ellipse cx="110" cy="172" rx="45" ry="47" fill={ORANGE} />
          <ellipse cx="110" cy="182" rx="28" ry="33" fill={CREAM} />
          <path d="M70 160 q8 2 12 8 M68 180 q9 1 13 7 M150 160 q-8 2 -12 8" stroke={STRIPE} strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* tali tas */}
          <path d="M84 136 Q 80 158 84 186" stroke={RED_DARK} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d="M136 136 Q 140 158 136 186" stroke={RED_DARK} strokeWidth="8" strokeLinecap="round" fill="none" />

          {/* buku pelangi + tangan yang memegang */}
          <g transform="rotate(-8 132 188)">
            <rect x="112" y="164" width="42" height="50" rx="5" fill="#5BB3E8" />
            <rect x="112" y="164" width="6" height="50" rx="3" fill={BLUE_DARK} />
            <path d="M122 204 a14 14 0 0 1 28 0" stroke="#E5484D" strokeWidth="4" fill="none" />
            <path d="M126 204 a10 10 0 0 1 20 0" stroke="#F5C443" strokeWidth="4" fill="none" />
            <path d="M130 204 a6 6 0 0 1 12 0" stroke="#4CB86B" strokeWidth="4" fill="none" />
          </g>
          <path d="M146 146 Q 156 170 138 188" stroke={ORANGE} strokeWidth="17" strokeLinecap="round" fill="none" />
          <circle cx="136" cy="190" r="10" fill={ORANGE_DARK} />

          {/* lengan yang melambai */}
          <motion.g animate={arm} style={{ originX: 1, originY: 1 }}>
            <path d="M76 150 Q 56 132 48 106" stroke={ORANGE} strokeWidth="17" strokeLinecap="round" fill="none" />
            <path d="M58 132 l-8 2 M52 118 l-8 1" stroke={STRIPE} strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="46" cy="98" r="13" fill={CREAM} />
            <ellipse cx="46" cy="101" rx="5" ry="4" fill={PINK} />
            <circle cx="39" cy="92" r="2.6" fill={PINK} />
            <circle cx="46" cy="89" r="2.6" fill={PINK} />
            <circle cx="53" cy="92" r="2.6" fill={PINK} />
          </motion.g>

          {/* kepala */}
          <motion.g style={{ rotate: headRot, originX: 0.5, originY: 0.92 }}>
            <circle cx="66" cy="58" r="19" fill={ORANGE} />
            <circle cx="154" cy="58" r="19" fill={ORANGE} />
            <circle cx="66" cy="60" r="10" fill={PINK} />
            <circle cx="154" cy="60" r="10" fill={PINK} />
            <ellipse cx="110" cy="92" rx="54" ry="47" fill={ORANGE} />
            <path d="M96 52 q4 10 0 18 M110 48 v18 M124 52 q-4 10 0 18" stroke={STRIPE} strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <path d="M58 90 q10 0 16 6 M162 90 q-10 0 -16 6 M60 104 q9 -1 14 3 M160 104 q-9 -1 -14 3" stroke={STRIPE} strokeWidth="4" strokeLinecap="round" fill="none" />
            <ellipse cx="110" cy="112" rx="34" ry="22" fill={CREAM} />

            {/* pipi merona */}
            <motion.ellipse cx="78" cy="110" rx="9" ry="5.5" fill={PINK} animate={{ opacity: shy ? 0.95 : 0.55 }} />
            <motion.ellipse cx="142" cy="110" rx="9" ry="5.5" fill={PINK} animate={{ opacity: shy ? 0.95 : 0.55 }} />

            {/* mata */}
            {[90, 130].map((cx) => (
              <g key={cx}>
                <ellipse cx={cx} cy="89" rx="11.5" ry="12.5" fill="#fff" />
                <motion.g style={{ x: eyeX, y: eyeY }}>
                  <motion.g style={{ originY: 0.5 }} animate={{ scaleY: blink ? 0.08 : 1 }} transition={{ duration: 0.08 }}>
                    <circle cx={cx} cy="90" r="8" fill="#7A4420" />
                    <circle cx={cx} cy="90" r="4.4" fill="#21140B" />
                    <circle cx={cx - 2.4} cy="86.6" r="2.2" fill="#fff" />
                  </motion.g>
                </motion.g>
              </g>
            ))}

            {/* hidung + mulut */}
            <path d="M103 104 h14 l-7 7 z" fill="#E77F8B" />
            {mouthOpen || mood === 'thinking' ? (
              <path d="M100 115 q10 12 20 0 q-10 4 -20 0 z" fill="#8C2F39" />
            ) : (
              <path d="M110 111 v4 M110 115 q-6 5 -11 1 M110 115 q6 5 11 1" stroke="#5B2B1A" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            )}

            {/* topi */}
            <motion.g animate={cap} style={{ originX: 0.3, originY: 1 }}>
              <path d="M62 66 C 64 30, 156 30, 158 66 Q 110 56 62 66 z" fill={BLUE} />
              <path d="M150 62 q30 0 36 10 q-24 4 -44 -2 z" fill={BLUE_DARK} />
              <circle cx="110" cy="36" r="4" fill={BLUE_DARK} />
            </motion.g>
          </motion.g>

          {/* titik "berpikir" */}
          {mood === 'thinking' &&
            [0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={176 + i * 13}
                cy={46 - i * 9}
                r={4 + i * 1.4}
                fill="#AFA9EC"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
        </svg>
      </motion.div>
    </button>
  );
}
