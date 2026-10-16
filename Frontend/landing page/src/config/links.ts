/**
 * URL aplikasi utama ISYARA (folder `main`).
 * Mendukung VITE_APP_URL, VITE_LOGIN_URL, atau VITE_KIOSK_URL dari environment variable Vercel.
 * Jika tidak disetel, default langsung mengarah ke URL produksi Vercel (https://isyara-jointss.vercel.app/login).
 */
/** URL tujuan harus absolut dan memakai http/https; nilai keliru dibatalkan, bukan dibuka. */
export function isValidAppUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function parseValidUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return isValidAppUrl(trimmed) ? trimmed : null;
}

const DEFAULT_LOGIN_URL = 'https://isyara-jointss.vercel.app/login';
const DEFAULT_APP_URL = 'https://isyara-jointss.vercel.app';

const validAppUrl =
  parseValidUrl(import.meta.env.VITE_APP_URL) ||
  parseValidUrl(import.meta.env.VITE_KIOSK_URL);

const validLoginUrl = parseValidUrl(import.meta.env.VITE_LOGIN_URL);

/** URL halaman masuk siswa (NIS) di aplikasi utama. */
export const LOGIN_URL: string =
  validLoginUrl ||
  (validAppUrl
    ? (validAppUrl.endsWith('/login') ? validAppUrl : `${validAppUrl.replace(/\/+$/, '')}/login`)
    : DEFAULT_LOGIN_URL);

/** URL aplikasi utama ISYARA (folder `main`). */
export const KIOSK_URL: string =
  validAppUrl ||
  LOGIN_URL ||
  DEFAULT_APP_URL;

