import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { HandSkeleton } from './hand-skeleton';

/**
 * Avatar placeholder penanda isyarat (ilustrasi, BUKAN isyarat BISINDO yang benar).
 * Dipakai di thumbnail materi & ilustrasi selama video materi asli belum tersedia.
 * `tone` mengubah warna baju supaya kartu materi tidak terlihat sama semua.
 * Gerak tangan otomatis dimatikan oleh MotionConfig reducedMotion="user".
 */
const TONES = {
  brand: { shirt: 'fill-brand-800', hair: 'fill-brand-950' },
  ink: { shirt: 'fill-brand-950', hair: 'fill-brand-950' },
  violet: { shirt: 'fill-brand-600', hair: 'fill-brand-900' },
} as const;

export type SignerTone = keyof typeof TONES;

export function SignerAvatar({ className, tone = 'ink', animated = true }: { className?: string; tone?: SignerTone; animated?: boolean }) {
  const t = TONES[tone];
  const loop = (delay: number) =>
    animated ? { duration: 2.6, repeat: Infinity, repeatType: 'mirror' as const, ease: 'easeInOut' as const, delay } : { duration: 0 };
  return (
    <div aria-hidden="true" className={cn('pointer-events-none', className)}>
      <div className="relative size-full">
        <svg viewBox="0 0 200 170" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax meet">
          <path d="M34 170c0-44 28-66 66-66s66 22 66 66Z" className={t.shirt} />
          <rect x="90" y="84" width="20" height="26" rx="9" className="fill-[#e9c9b3]" />
          <ellipse cx="100" cy="64" rx="27" ry="31" className="fill-[#f1d5c1]" />
          <path d="M72 66c-3-30 13-44 28-44 18 0 32 12 28 44-3-14-13-22-28-22s-25 8-28 22Z" className={t.hair} />
          <circle cx="90" cy="68" r="2.6" className="fill-brand-950" />
          <circle cx="110" cy="68" r="2.6" className="fill-brand-950" />
          <path d="M92 81c5 4 11 4 16 0" className="fill-none stroke-brand-950" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <motion.div
          className="absolute bottom-[4%] left-[24%] w-[22%] text-brand-100"
          animate={animated ? { y: ['0%', '-14%'], rotate: [-4, 8] } : undefined}
          transition={loop(0)}
          style={{ originY: 1 }}
        >
          <HandSkeleton className="w-full" dotClassName="fill-[#f1d5c1] stroke-brand-950" />
        </motion.div>
        <motion.div
          className="absolute bottom-[8%] right-[24%] w-[20%] text-brand-100"
          animate={animated ? { y: ['-6%', '6%'], rotate: [6, -6] } : undefined}
          transition={loop(0.3)}
          style={{ originY: 1 }}
        >
          <HandSkeleton className="w-full" mirrored dotClassName="fill-[#f1d5c1] stroke-brand-950" />
        </motion.div>
      </div>
    </div>
  );
}
