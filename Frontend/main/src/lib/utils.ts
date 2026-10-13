import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Panel simulator & overlay debug hanya aktif dengan ?dev=1 (prompt animasi §3). */
export const isDevMode = () => new URLSearchParams(window.location.search).get('dev') === '1';
