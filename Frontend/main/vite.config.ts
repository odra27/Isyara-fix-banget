import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Landing page jalan di 5173, kiosk di 5174 (lihat VITE_KIOSK_URL / VITE_LANDING_URL di .env).
//
// HTTPS untuk uji di HP/tablet (PRD-FE §9): kamera & mic hanya diizinkan browser pada
// secure context (https / localhost). Di laptop, http://localhost sudah secure context,
// jadi HTTPS dimatikan secara default agar dev harian tidak kena peringatan sertifikat.
// Untuk uji lewat IP LAN di perangkat lain, jalankan `npm run dev:https` (set VITE_HTTPS=1)
// lalu buka https://<ip-laptop>:5174 dan terima peringatan sertifikat self-signed sekali.
const useHttps = process.env.VITE_HTTPS === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(useHttps ? [basicSsl()] : [])],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // host: true → server juga listen di IP LAN sehingga bisa dibuka dari HP/tablet sejaringan.
  // proxy /api → backend lokal. Dengan VITE_API_BASE_URL=/ browser memanggil origin yang sama,
  // jadi tidak kena CORS / mixed content walau dibuka lewat https://<ip-laptop>:5174 dari HP.
  server: {
    host: useHttps,
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  preview: { port: 4174, strictPort: true },
});
