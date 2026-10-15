import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { CaptionSize } from '@/state/SettingsContext';

/**
 * Caption gaya YouTube di atas video / animasi isyarat: teks putih tebal di kotak hitam 75%,
 * ±9% dari bawah, maksimal 2 baris. Kata yang sedang diisyaratkan disorot kuning, jadi siswa bisa
 * mengikuti teks dan isyarat sekaligus. Ukuran S/M/L; `big` dipakai saat layar penuh.
 */
const WORDS_PER_LINE = 7;

const SIZE: Record<CaptionSize, { normal: string; big: string }> = {
  S: { normal: 'text-[0.8125rem] sm:text-sm', big: 'text-xl' },
  M: { normal: 'text-[0.9375rem] sm:text-base', big: 'text-[1.75rem]' },
  L: { normal: 'text-lg sm:text-xl', big: 'text-[2.125rem]' },
};

export function SignCaption({
  words,
  active,
  size,
  big = false,
  className,
}: {
  words: string[];
  /** Indeks kata aktif; -1 = tidak ada yang disorot. */
  active: number;
  size: CaptionSize;
  big?: boolean;
  className?: string;
}) {
  // Potong per 2 baris (±14 kata) supaya caption tidak menutupi isyarat.
  const page = Math.max(0, Math.floor(Math.max(0, active) / (WORDS_PER_LINE * 2)));
  const start = page * WORDS_PER_LINE * 2;
  const shown = useMemo(() => words.slice(start, start + WORDS_PER_LINE * 2), [words, start]);
  if (shown.length === 0) return null;

  return (
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-[9%] flex justify-center px-[6%]', className)}>
      <p
        className={cn(
          'max-w-full rounded-md bg-black/75 px-2.5 py-1 text-center font-bold leading-snug text-white [box-decoration-break:clone] [-webkit-box-decoration-break:clone]',
          big ? SIZE[size].big : SIZE[size].normal,
        )}
        style={{ textShadow: '0 1px 2px rgba(0,0,0,.6)' }}
      >
        {shown.map((w, i) => {
          const idx = start + i;
          return (
            <span key={`${idx}-${w}`} className={cn('transition-colors duration-150', idx === active ? 'text-[#FFD84D]' : 'text-white')}>
              {w}
              {i < shown.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </p>
    </div>
  );
}
