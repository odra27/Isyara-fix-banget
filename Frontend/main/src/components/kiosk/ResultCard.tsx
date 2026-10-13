import { motion } from 'framer-motion';
import { Check, CircleQuestionMark, RotateCcw, Users, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MatchResult } from '@/types/kiosk';
import { cn } from '@/lib/utils';

/**
 * Tampilan hasil sesuai confidence (PRD-FE §6), dipakai kedua alur.
 * accepted  → teks hasil (+ indikator dibacakan)
 * confirmed → "Kemungkinan maksud" + bar confidence + Konfirmasi / Coba Lagi / Panggil JBI
 * escalated → "Tidak ada frasa yang cocok" + Panggil JBI (utama) + Coba Lagi
 */
type Props = {
  result: MatchResult;
  /** Label kecil di atas teks hasil saat accepted. */
  acceptedLabel: string;
  confirmLabel: string;
  speaking?: boolean;
  onConfirm: () => void;
  onRetry: () => void;
  onJbi: () => void;
  className?: string;
};

export function ConfidenceBar({ value, tone }: { value: number; tone: 'ok' | 'mid' | 'low' }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-brand-50"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Tingkat keyakinan"
      >
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={cn('block h-full rounded-full', tone === 'ok' ? 'bg-ok' : tone === 'mid' ? 'bg-brand-400' : 'bg-brand-200')}
        />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums text-brand-800">{pct}%</span>
    </div>
  );
}

function SpeakingWave({ on }: { on: boolean }) {
  return (
    <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
      {[8, 14, 18, 11, 15, 9].map((h, i) => (
        <i
          key={i}
          className={cn('block w-[3px] rounded-full bg-brand-400', on && 'anim-bar')}
          style={{ height: h, animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </span>
  );
}

const enter = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } };

export function ResultCard({ result, acceptedLabel, confirmLabel, speaking, onConfirm, onRetry, onJbi, className }: Props) {
  if (result.action === 'accepted') {
    const words = (result.phraseText ?? '').split(' ');
    return (
      <motion.div {...enter} className={cn('rounded-3xl bg-white p-5 md:p-6', className)} data-result="accepted">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{acceptedLabel}</p>
        <p className="mt-2 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.04em] md:text-[2.5rem]">
          {words.map((w, i) => (
            <motion.span
              key={i}
              className="mr-[0.25em] inline-block"
              initial={{ opacity: 0, y: '0.4em' }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {w}
            </motion.span>
          ))}
        </p>
        <div className="mt-4">
          <ConfidenceBar value={result.confidence} tone="ok" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-800">
            <Volume2 className="size-4 text-brand-600" aria-hidden="true" />
            {speaking ? 'Sedang dibacakan untuk petugas' : 'Sudah dibacakan'}
            <SpeakingWave on={!!speaking} />
          </span>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RotateCcw /> Isyarat lain
          </Button>
        </div>
      </motion.div>
    );
  }

  if (result.action === 'confirmed') {
    return (
      <motion.div {...enter} className={cn('rounded-3xl border-2 border-brand-200 bg-white p-5 md:p-6', className)} data-result="confirmed">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{confirmLabel}</p>
        <p className="mt-2 text-[1.75rem] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[2.125rem]">“{result.phraseText}”</p>
        <div className="mt-4">
          <ConfidenceBar value={result.confidence} tone="mid" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { key: 'c', node: <Button onClick={onConfirm} size="lg" className="w-full"><Check /> Konfirmasi</Button> },
            { key: 'r', node: <Button onClick={onRetry} variant="outline" size="lg" className="w-full"><RotateCcw /> Coba lagi</Button> },
            { key: 'j', node: <Button onClick={onJbi} variant="outline" size="lg" className="w-full"><Users /> Panggil JBI</Button> },
          ].map((b, i) => (
            <motion.div key={b.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
              {b.node}
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...enter} className={cn('rounded-3xl bg-white p-5 md:p-6', className)} data-result="unknown">
      <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
        <CircleQuestionMark className="size-5 text-muted" aria-hidden="true" />
        Tidak ada frasa yang cocok
      </p>
      <p className="mt-1.5 text-sm text-muted">Kami tidak mau menebak. Coba sekali lagi atau minta bantuan juru bahasa isyarat.</p>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr]">
        <motion.div initial={{ scale: 1 }} animate={{ scale: [1, 1.04, 1] }} transition={{ delay: 0.35, duration: 0.5 }}>
          <Button onClick={onJbi} variant="dark" size="lg" className="w-full">
            <Users /> Panggil JBI
          </Button>
        </motion.div>
        <Button onClick={onRetry} variant="outline" size="lg" className="w-full">
          <RotateCcw /> Coba lagi
        </Button>
      </div>
    </motion.div>
  );
}
