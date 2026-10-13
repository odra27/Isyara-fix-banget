import { APP } from '@/config/app.config';
import { AUTH } from './auth.config';
import type { LoginResult, PetugasProfile } from './types';

/**
 * Auth service petugas.
 *
 * PERINGATAN: lapisan ini adalah GERBANG UI/UX, BUKAN proteksi keamanan.
 * Pada mode dummy seluruh verifikasi terjadi di browser, sehingga kredensial di
 * bawah dapat dibaca siapa pun yang membuka devtools. Jangan pernah mengisi
 * DUMMY_ACCOUNTS dengan ID/password/data pegawai yang sebenarnya.
 * Proteksi nyata harus dilakukan BE (verifikasi password + sesi bertanda tangan).
 *
 * - VITE_API_BASE_URL kosong → mockAuthService (DUMMY_ACCOUNTS di bawah).
 * - VITE_API_BASE_URL terisi → httpAuthService (POST /api/auth/login).
 * Antarmuka keduanya sama, jadi UI tidak perlu berubah saat BE siap.
 */
export interface AuthService {
  login(employeeId: string, password: string): Promise<LoginResult>;
}

// ---------------------------------------------------------------- Dummy (tanpa BE)

type DummyAccount = { password: string; profile: PetugasProfile };

/** Akun demo. Semua nilai fiktif — aman ditampilkan di layar login. */
export const DUMMY_ACCOUNTS: readonly DummyAccount[] = [
  {
    password: 'isyara123',
    profile: {
      employeeId: 'PTG-001',
      name: 'Sarah Wijaya',
      role: 'Dokter Umum',
      unit: 'Puskesmas Krobokan',
      todaySchedule: '08:00 - 14:00',
      // Foto demo lokal. Bila file tidak ada, UI otomatis jatuh ke avatar inisial.
      // Saat BE siap, nilai ini diganti URL dari server.
      photoUrl: '/petugas/ptg-001.jpg',
    },
  },
  {
    password: 'isyara456',
    profile: {
      employeeId: 'PTG-002',
      name: 'Bagas Pratama',
      role: 'Perawat',
      unit: 'Puskesmas Krobokan',
      todaySchedule: '14:00 - 20:00',
    },
  },
];

/** Dipakai Login_Page untuk menampilkan kolom kredensial demo selama BE belum tersambung. */
export const demoCredentials = DUMMY_ACCOUNTS.map((a) => ({ employeeId: a.profile.employeeId, password: a.password }));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockAuthService: AuthService = {
  async login(employeeId, password) {
    // Jeda kecil agar status "Memeriksa…" terlihat seperti permintaan jaringan nyata.
    await wait(450);
    const found = DUMMY_ACCOUNTS.find((a) => a.profile.employeeId === employeeId && a.password === password);
    return found ? { ok: true, profile: found.profile } : { ok: false, reason: 'invalid-credentials' };
  },
};

// ---------------------------------------------------------------- HTTP (saat BE siap)

/** Kontrak BE: Backend/app/api/auth.py (LoginResponse, MeResponse). */
type ApiLoginResponse = {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_token: string;
  user: { id: string; full_name: string; role: 'admin' | 'petugas'; nip: string | null };
};

type ApiMeResponse = {
  id: string;
  full_name: string;
  role: 'admin' | 'petugas';
  job_title: string;
  nip: string | null;
  unit_kerja: string;
  shift_schedule: string | null;
  avatar_url: string | null;
  institution: { id: string; name: string };
};

export const httpAuthService: AuthService = {
  async login(employeeId, password) {
    const ctrl = new AbortController();
    // Login = 2 request (login + /api/me), beri waktu dua kali lipat.
    const timer = setTimeout(() => ctrl.abort(), APP.requestTimeoutMs * 2);
    try {
      // `identifier` boleh email, NIP, atau username (BE mencari ketiganya).
      const res = await fetch(`${APP.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: employeeId, password }),
        signal: ctrl.signal,
      });
      if (res.status === 401) return { ok: false, reason: 'invalid-credentials' };
      if (!res.ok) return { ok: false, reason: 'service-error' };
      const login = (await res.json()) as ApiLoginResponse;

      // Unit kerja, jabatan & jadwal hanya ada di /api/me.
      const meRes = await fetch(`${APP.apiBaseUrl}/api/me`, {
        headers: { Authorization: `Bearer ${login.access_token}` },
        signal: ctrl.signal,
      });
      if (!meRes.ok) return { ok: false, reason: 'service-error' };
      const me = (await meRes.json()) as ApiMeResponse;

      return {
        ok: true,
        accessToken: login.access_token,
        profile: {
          employeeId: me.nip ?? employeeId,
          name: me.full_name,
          role: me.job_title || undefined,
          unit: me.unit_kerja,
          todaySchedule: me.shift_schedule ?? '-',
        },
      };
    } catch {
      return { ok: false, reason: 'service-error' };
    } finally {
      clearTimeout(timer);
    }
  },
};

export const authService: AuthService = APP.authMode === 'api' ? httpAuthService : mockAuthService;
/** true = kredensial dummy dipakai, jadi kolom demo boleh ditampilkan di Login_Page. */
export const isMockAuth = APP.authMode !== 'api';

/** Validasi panjang masukan sebelum memanggil service (Requirement 3). */
export function validateCredentialLengths(employeeId: string, password: string): string | null {
  if (employeeId.length > AUTH.maxEmployeeIdLength) return `ID Pegawai maksimal ${AUTH.maxEmployeeIdLength} karakter.`;
  if (password.length > AUTH.maxPasswordLength) return `Password maksimal ${AUTH.maxPasswordLength} karakter.`;
  return null;
}
