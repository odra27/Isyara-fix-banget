import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * SlideTabs (diadaptasi dari komponen slide-tabs):
 * - Controlled (value/onChange) + TypeScript.
 * - Kursor pill mengikuti hover, kembali ke tab terpilih saat mouse keluar.
 * - Ikon tab terpilih beranimasi saat berganti.
 * - Aksesibilitas: role tablist/tab, aria-selected, navigasi panah kiri/kanan.
 * - mix-blend-difference diganti warna eksplisit agar kontras tetap terjaga di palet ungu.
 */
export type SlideTab<T extends string> = { id: T; label: string; icon: ReactNode; badge?: number };

type Props<T extends string> = {
  tabs: SlideTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** id prefix untuk aria-controls → panel harus memakai id `${idPrefix}-panel-${tab.id}` */
  idPrefix?: string;
};

type Pos = { left: number; width: number; opacity: number };

export function SlideTabs<T extends string>({ tabs, value, onChange, className, idPrefix = 'tabs' }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState<Pos>({ left: 0, width: 0, opacity: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const selected = Math.max(0, tabs.findIndex((t) => t.id === value));

  const moveTo = useCallback((i: number) => {
    const el = refs.current[i];
    if (el) setPos({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
  }, []);

  useLayoutEffect(() => {
    moveTo(selected);
    const el = refs.current[selected]?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => moveTo(selected));
    ro.observe(el);
    return () => ro.disconnect();
  }, [selected, moveTo]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (selected + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  const highlighted = hover ?? selected;

  return (
    <div
      role="tablist"
      aria-label="Mode kiosk"
      onKeyDown={onKey}
      onMouseLeave={() => {
        setHover(null);
        moveTo(selected);
      }}
      className={cn('relative flex w-fit rounded-full border border-line bg-white p-1 shadow-soft', className)}
    >
      {tabs.map((tab, i) => {
        const isSel = i === selected;
        const isLit = i === highlighted;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={isSel}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={isSel ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onMouseEnter={() => {
              setHover(i);
              moveTo(i);
            }}
            className={cn(
              'relative z-10 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors duration-200 sm:px-5 sm:py-2.5',
              isLit ? 'text-white' : 'text-brand-800',
            )}
          >
            <motion.span
              key={isSel ? `${tab.id}-on` : tab.id}
              initial={isSel ? { scale: 0.4, rotate: -25, opacity: 0 } : false}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              className="grid size-5 place-items-center"
              aria-hidden="true"
            >
              {tab.icon}
            </motion.span>
            <span>{tab.label}</span>
            {tab.badge ? (
              <span
                className={cn(
                  'grid min-w-5 place-items-center rounded-full px-1.5 text-[0.6875rem] leading-5',
                  isLit ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600',
                )}
              >
                {tab.badge}
                <span className="sr-only"> pesan</span>
              </span>
            ) : null}
          </button>
        );
      })}
      <motion.span
        aria-hidden="true"
        animate={pos}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn('absolute inset-y-1 z-0 rounded-full', highlighted === selected ? 'bg-brand-600' : 'bg-brand-800')}
      />
    </div>
  );
}
