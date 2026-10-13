import { motion } from 'framer-motion';
import type { Phrase } from '@/data/phrases.mock';
import { cn } from '@/lib/utils';

/** Grid frasa untuk mode manual / pintasan. Dikelompokkan per kategori. */
export function PhrasePicker({
  phrases,
  onPick,
  label,
  compact = false,
}: {
  phrases: Phrase[];
  onPick: (p: Phrase) => void;
  label: string;
  compact?: boolean;
}) {
  const groups = phrases.reduce<Record<string, Phrase[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-4">
      {Object.entries(groups).map(([cat, list], gi) => (
        <div key={cat}>
          <p className="mb-2 text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-muted">{cat}</p>
          <div className={cn('grid gap-2', compact ? 'flex flex-wrap' : 'grid-cols-1 sm:grid-cols-2')}>
            {list.map((p, i) => (
              <motion.button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gi * 0.04 + i * 0.03 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'rounded-2xl border border-line bg-white text-left font-bold text-brand-900 transition-colors hover:border-brand-200 hover:bg-brand-50',
                  compact ? 'px-3 py-2 text-sm' : 'px-4 py-3.5 text-base',
                )}
              >
                {p.text}
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
