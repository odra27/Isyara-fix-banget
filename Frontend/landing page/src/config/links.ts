/**
 * URL aplikasi utama ISYARA (folder `main`).
 * Mendukung VITE_APP_URL, VITE_LOGIN_URL, atau VITE_KIOSK_URL dari environment variable Vercel.
 * Jika tidak disetel, default langsung mengarah ke URL produksi Vercel (https://isyara-jointss.vercel.app/login).
 */
const RAW_APP_URL = (
  import.meta.env.VITE_APP_URL ||
  import.meta.env.VITE_KIOSK_URL ||
  ''
).trim();

const RAW_LOGIN_URL = (import.meta.env.VITE_LOGIN_URL || '').trim();

const DEFAULT_LOGIN_URL = 'https://isyara-jointss.vercel.app/login';
const DEFAULT_APP_URL = 'https://isyara-jointss.vercel.app';

/** URL halaman masuk siswa (NIS) di aplikasi utama. */
export const LOGIN_URL: string =
  RAW_LOGIN_URL ||
  (RAW_APP_URL
    ? (RAW_APP_URL.endsWith('/login') ? RAW_APP_URL : `${RAW_APP_URL.replace(/\/+$/, '')}/login`)
    : DEFAULT_LOGIN_URL);

/** URL aplikasi utama ISYARA (folder `main`). */
export const KIOSK_URL: string =
  RAW_APP_URL ||
  LOGIN_URL ||
  DEFAULT_APP_URL;

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

