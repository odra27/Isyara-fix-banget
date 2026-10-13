/** URL aplikasi kiosk (folder `main`). Atur lewat VITE_KIOSK_URL di .env saat deploy. */
export const KIOSK_URL: string = import.meta.env.VITE_KIOSK_URL || 'http://localhost:5174/';

/** URL halaman masuk petugas di aplikasi kiosk. Atur lewat VITE_LOGIN_URL di .env saat deploy. */
export const LOGIN_URL: string = import.meta.env.VITE_LOGIN_URL || 'http://localhost:5174/login';

/** URL tujuan harus absolut dan memakai http/https; nilai keliru dibatalkan, bukan dibuka. */
export function isValidAppUrl(url: string): boolean {
    if (!url.trim()) return false;
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}
