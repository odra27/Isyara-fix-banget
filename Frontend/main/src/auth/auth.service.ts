import { APP } from '@/config/app.config';
import { AUTH } from './auth.config';
import type { LoginResult, SiswaProfile } from './types';

/**
 * Auth service siswa (ADR-051 D2). Akun dibuat sekolah; siswa masuk dengan NIS + password.
 *
 * PERINGATAN: mode dummy adalah GERBANG UI/UX, BUKAN proteksi keamanan. Kredensial di bawah
 * dapat dibaca siapa pun lewat devtools. Jangan isi DUMMY_ACCOUNTS dengan data siswa asli.
 *
 * - APP.authMode 'mock' → mockAuthService (DUMMY_ACCOUNTS).
 * - APP.authMode 'api'  → httpAuthService (POST /api/student/auth/login).
 */
export interface AuthService {
  login(nis: string, password: string): Promise<LoginResult>;
  /**
   * Perbarui token dengan refresh token (ADR-052). 'invalid' = token dicabut / akun nonaktif →
   * sesi harus diakhiri; 'service-error' = server tidak terjangkau → sesi dibiarkan.
   */
  refresh(refreshToken: string): Promise<LoginResult | { ok: false; reason: 'invalid' }>;
}

// ---------------------------------------------------------------- Dummy (tanpa BE)

type DummyAccount = { password: string; profile: SiswaProfile };

/** Akun demo. Semua nilai fiktif. */
export const DUMMY_ACCOUNTS: readonly DummyAccount[] = [
  {
    password: 'isyara123',
    profile: { id: 'demo-siswa-1', nis: '0012345678', name: 'Nadia Putri', className: '5A', grade: 5, school: 'SLB Negeri Contoh' },
  },
  {
    password: 'isyara456',
    profile: { id: 'demo-siswa-2', nis: '0087654321', name: 'Raka Pratama', className: '7B', grade: 7, school: 'SLB Negeri Contoh' },
  },
];

export const demoCredentials = DUMMY_ACCOUNTS.map((a) => ({ nis: a.profile.nis, password: a.password }));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockAuthService: AuthService = {
  async login(nis, password) {
    await wait(450);
    const found = DUMMY_ACCOUNTS.find((a) => a.profile.nis === nis && a.password === password);
    return found ? { ok: true, profile: found.profile } : { ok: false, reason: 'invalid-credentials' };
  },
  async refresh() {
    return { ok: false, reason: 'invalid' };
  },
};

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

export const authService: AuthService = APP.authMode === 'api' ? httpAuthService : mockAuthService;
/** true = kredensial dummy dipakai, jadi kolom akun demo boleh ditampilkan di halaman login. */
export const isMockAuth = APP.authMode !== 'api';

export function validateCredentialLengths(nis: string, password: string): string | null {
  if (nis.length > AUTH.maxNisLength) return `NIS maksimal ${AUTH.maxNisLength} karakter.`;
  if (password.length > AUTH.maxPasswordLength) return `Password maksimal ${AUTH.maxPasswordLength} karakter.`;
  return null;
}
