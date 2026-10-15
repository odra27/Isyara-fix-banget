import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Kata dengan coretan pena yang tergambar sekali di bawahnya (judul layar awal). */
export function PenUnderline({ children, delay = 0.45 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="relative z-10">{children}</span>
      <svg viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true" className="absolute -bottom-[0.18em] left-[-4%] h-[0.42em] w-[108%] overflow-visible">
        <motion.path
          d="M4 14 C 40 6, 90 4, 130 9 S 184 16, 196 8"
          fill="none"
          stroke="#AFA9EC"
          strokeWidth="7"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay, duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
    </span>
  );
}
