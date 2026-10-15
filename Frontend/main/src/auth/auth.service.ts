import { APP } from '@/config/app.config';
import { AUTH } from './auth.config';
import type { LoginResult, SiswaProfile } from './types';

/**
 * Auth service siswa (ADR-051 D2). Akun dibuat sekolah; siswa masuk dengan NIS + password lewat
 * Backend (POST /api/student/auth/login). Tidak ada mode demo (ADR-053).
 */
export interface AuthService {
  login(nis: string, password: string): Promise<LoginResult>;
  /**
   * Perbarui token dengan refresh token (ADR-052). 'invalid' = token dicabut / akun nonaktif →
   * sesi harus diakhiri; 'service-error' = server tidak terjangkau → sesi dibiarkan.
   */
  refresh(refreshToken: string): Promise<LoginResult | { ok: false; reason: 'invalid' }>;
}

/**
 * Akun siap pakai yang ditampilkan di bawah form login (akun asli di Supabase), diisi lewat
 * Frontend/main/.env (VITE_DEMO_NIS + VITE_DEMO_PASSWORD). Kosong = kotak tidak tampil.
 * Nilainya ikut ke bundle FE, jadi kosongkan untuk build publik.
 */
const demoNis = (import.meta.env.VITE_DEMO_NIS || '').trim();
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || '';
export const readyAccounts = demoNis && demoPassword ? [{ nis: demoNis, password: demoPassword }] : [];

// ---------------------------------------------------------------- HTTP

/** Kontrak BE: backend/app/api/student.py (StudentLoginResponse). */
type ApiStudent = {
  id: string;
  nis: string;
  full_name: string;
  class_name: string | null;
  grade: number | null;
  avatar_url: string | null;
  institution: { id: string; name: string };
};
type ApiLoginResponse = { access_token: string; token_type: 'bearer'; expires_in: number; refresh_token: string; student: ApiStudent };

export const toProfile = (s: ApiStudent): SiswaProfile => ({
  id: s.id,
  nis: s.nis,
  name: s.full_name,
  className: s.class_name ?? undefined,
  grade: s.grade ?? undefined,
  school: s.institution.name,
  photoUrl: s.avatar_url ?? undefined,
});

async function postAuth(path: string, body: unknown): Promise<LoginResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), APP.requestTimeoutMs * 2);
  try {
    const res = await fetch(`${APP.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status === 401) return { ok: false, reason: 'invalid-credentials' };
    if (!res.ok) return { ok: false, reason: 'service-error' };
    const data = (await res.json()) as ApiLoginResponse;
    return {
      ok: true,
      profile: toProfile(data.student),
      tokens: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 },
    };
  } catch {
    return { ok: false, reason: 'service-error' };
  } finally {
    clearTimeout(timer);
  }
}

export const httpAuthService: AuthService = {
  login: (nis, password) => postAuth('/api/student/auth/login', { nis, password }),
  async refresh(refreshToken) {
    const r = await postAuth('/api/student/auth/refresh', { refresh_token: refreshToken });
    return !r.ok && r.reason === 'invalid-credentials' ? { ok: false, reason: 'invalid' } : r;
  },
};

export const authService: AuthService = httpAuthService;

export function validateCredentialLengths(nis: string, password: string): string | null {
  if (nis.length > AUTH.maxNisLength) return `NIS maksimal ${AUTH.maxNisLength} karakter.`;
  if (password.length > AUTH.maxPasswordLength) return `Password maksimal ${AUTH.maxPasswordLength} karakter.`;
  return null;
}
