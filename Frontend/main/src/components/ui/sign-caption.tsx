import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CaptionSize } from '@/state/SettingsContext';

/**
 * Caption gaya YouTube di atas video / animasi isyarat: teks putih tebal di kotak hitam 75%,
 * ±9% dari bawah, maksimal 2 baris. Kata yang sedang diisyaratkan disorot kuning, jadi siswa bisa
 * mengikuti teks dan isyarat sekaligus. Ukuran S/M/L; `big` dipakai saat layar penuh.
 *
 * Caption dipotong per 2 baris supaya tidak menutupi isyarat. Berapa kata yang masuk 2 baris
 * dihitung dari lebar kotak caption dan ukuran hurufnya, sebab komponen ini dipakai pada lebar
 * yang sangat berbeda: pemutar video, gelembung chat, sampai panel tanya di samping video yang
 * hanya ±200px. Jumlah kata tetap akan meluber jadi 5–6 baris di panel sempit.
 */
const SIZE: Record<CaptionSize, { normal: string; big: string }> = {
  S: { normal: 'text-[0.8125rem] sm:text-sm', big: 'text-xl' },
  M: { normal: 'text-[0.9375rem] sm:text-base', big: 'text-[1.75rem]' },
  L: { normal: 'text-lg sm:text-xl', big: 'text-[2.125rem]' },
};

/** Perkiraan lebar satu kata: rata-rata kata + spasi (±6,5 huruf) × lebar huruf tebal (±0,55em). */
const WORD_EM = 6.5 * 0.55;
/** Padding kiri + kanan kotak caption (px-2.5). */
const BOX_PADDING = 20;
const MIN_PER_LINE = 2;
const LINES = 2;

export function SignCaption({
  words,
  active,
  size,
  big = false,
  inline = false,
  className,
}: {
  words: string[];
  /** Indeks kata aktif; -1 = tidak ada yang disorot. */
  active: number;
  size: CaptionSize;
  big?: boolean;
  /**
   * Taruh caption DI BAWAH animasi, bukan menimpanya. Dipakai pada kotak yang terlalu pendek
   * untuk memuat keduanya (mis. gelembung chat di panel tanya samping video).
   */
  inline?: boolean;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const [perPage, setPerPage] = useState(14);

  // Ukur lebar yang tersedia + ukuran huruf sebenarnya (kelas ukuran ikut breakpoint & tombol "Aa").
  useLayoutEffect(() => {
    const box = wrap.current;
    const text = line.current;
    if (!box || !text) return;
    const update = () => {
      const avail = box.clientWidth - BOX_PADDING;
      const fontSize = parseFloat(getComputedStyle(text).fontSize) || 15;
      const perLine = Math.max(MIN_PER_LINE, Math.floor(avail / (fontSize * WORD_EM)));
      setPerPage(perLine * LINES);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [size, big]);

  const start = Math.max(0, Math.floor(Math.max(0, active) / perPage)) * perPage;
  const shown = useMemo(() => words.slice(start, start + perPage), [words, start, perPage]);

  return (
    <div
      ref={wrap}
      className={cn(
        'flex justify-center',
        inline ? 'px-2 pb-2 pt-1' : 'pointer-events-none absolute inset-x-0 bottom-[9%] px-[6%]',
        className,
      )}
    >
      <p
        ref={line}
        className={cn(
          'max-w-full rounded-md bg-black/75 px-2.5 py-1 text-center font-bold leading-snug text-white [box-decoration-break:clone] [-webkit-box-decoration-break:clone]',
          big ? SIZE[size].big : SIZE[size].normal,
          shown.length === 0 && 'invisible',
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
