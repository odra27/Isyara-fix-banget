import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Judul halaman yang seragam di semua menu. */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
        {eyebrow && <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p>}
        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.045em] md:text-[2.25rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </motion.div>
      {actions && <div className="self-start md:self-auto">{actions}</div>}
    </div>
  );
}
