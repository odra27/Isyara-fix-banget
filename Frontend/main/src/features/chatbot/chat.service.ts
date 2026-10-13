import { APP } from '@/config/app.config';
import { sessionStore } from '@/auth/session.store';
import { getAccessToken, refreshSession } from '@/auth/token';
import { uid } from '@/lib/utils';

/**
 * Chatbot siswa (ADR-051 D3/D4).
 * - APP.authMode 'api'  → httpChatService: backend/app/api/chat.py (riwayat di Postgres, model OpenRouter).
 * - APP.authMode 'mock' → mockChatService: riwayat di localStorage per siswa, jawaban demo lokal.
 * FE tidak pernah memanggil OpenRouter langsung; API key hanya ada di BE.
 */
export type InputMode = 'text' | 'sign';
export type ChatSession = { id: string; title: string; createdAt: string; updatedAt: string };
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; inputMode: InputMode | null; createdAt: string };
export type SendResult = { session: ChatSession; user: ChatMessage; assistant: ChatMessage; model: 'openrouter' | 'offline' | 'demo' };

export class ChatError extends Error {
  constructor(
    message: string,
    public kind: 'auth' | 'not-found' | 'model' | 'timeout' | 'network' | 'server',
  ) {
    super(message);
  }
}

export interface ChatService {
  listSessions(): Promise<ChatSession[]>;
  getMessages(sessionId: string): Promise<{ session: ChatSession; messages: ChatMessage[] }>;
  createSession(title?: string): Promise<ChatSession>;
  send(sessionId: string, content: string, inputMode: InputMode): Promise<SendResult>;
  rename(sessionId: string, title: string): Promise<ChatSession>;
  remove(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------- HTTP

type ApiSession = { id: string; title: string; created_at: string; updated_at: string };
type ApiMessage = { id: string; role: 'user' | 'assistant'; content: string; input_mode: InputMode | null; created_at: string };

const toSession = (s: ApiSession): ChatSession => ({ id: s.id, title: s.title, createdAt: s.created_at, updatedAt: s.updated_at });
const toMessage = (m: ApiMessage): ChatMessage => ({ id: m.id, role: m.role, content: m.content, inputMode: m.input_mode, createdAt: m.created_at });

/** Model bisa butuh belasan detik; BE sendiri memutus di 25 dtk (OPENROUTER_TIMEOUT_S). */
const SEND_TIMEOUT_MS = 35_000;

async function api<T>(path: string, init: RequestInit = {}, timeoutMs = APP.requestTimeoutMs * 2, retried = false): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ChatError('Sesi berakhir', 'auth');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${APP.apiBaseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
      signal: ctrl.signal,
    });
    // Token ditolak (mis. kedaluwarsa lebih cepat dari jam perangkat): perbarui sekali lalu ulangi.
    if (res.status === 401 && !retried) {
      clearTimeout(timer);
      const s = await refreshSession();
      if (s?.accessToken && s.accessToken !== token) return api<T>(path, init, timeoutMs, true);
      throw new ChatError('Sesi berakhir', 'auth');
    }
    if (res.status === 401 || res.status === 403) throw new ChatError('Sesi berakhir', 'auth');
    if (res.status === 404) throw new ChatError('Percakapan tidak ditemukan', 'not-found');
    if (res.status === 504) throw new ChatError('Model terlalu lama menjawab', 'timeout');
    if (res.status === 503) throw new ChatError('Model belum bisa menjawab', 'model');
    if (!res.ok) throw new ChatError(`HTTP ${res.status}`, 'server');
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  } catch (e) {
    if (e instanceof ChatError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new ChatError('Timeout', 'timeout');
    throw new ChatError('Network error', 'network');
  } finally {
    clearTimeout(timer);
  }
}

export const httpChatService: ChatService = {
  async listSessions() {
    const r = await api<{ items: ApiSession[] }>('/api/chat/sessions?page=1&page_size=100');
    return r.items.map(toSession);
  },
  async getMessages(id) {
    const r = await api<{ session: ApiSession; items: ApiMessage[] }>(`/api/chat/sessions/${encodeURIComponent(id)}/messages`);
    return { session: toSession(r.session), messages: r.items.map(toMessage) };
  },
  async createSession(title) {
    return toSession(await api<ApiSession>('/api/chat/sessions', { method: 'POST', body: JSON.stringify(title ? { title } : {}) }));
  },
  async send(id, content, inputMode) {
    const r = await api<{ session: ApiSession; user_message: ApiMessage; assistant_message: ApiMessage; model: 'openrouter' | 'offline' }>(
      `/api/chat/sessions/${encodeURIComponent(id)}/messages`,
      { method: 'POST', body: JSON.stringify({ content, input_mode: inputMode }) },
      SEND_TIMEOUT_MS,
    );
    return { session: toSession(r.session), user: toMessage(r.user_message), assistant: toMessage(r.assistant_message), model: r.model };
  },
  async rename(id, title) {
    return toSession(await api<ApiSession>(`/api/chat/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }));
  },
  async remove(id) {
    await api<void>(`/api/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------- Mock (tanpa BE)

type Store = { sessions: ChatSession[]; messages: Record<string, ChatMessage[]> };
const mockKey = () => `isyara.chat.${sessionStore.read()?.profile.id ?? 'anon'}`;

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(mockKey()) ?? 'null') as Store | null;
    if (s && Array.isArray(s.sessions) && s.messages) return s;
  } catch {
    // data rusak → mulai kosong
  }
  return { sessions: [], messages: {} };
}
const save = (s: Store) => {
  try {
    localStorage.setItem(mockKey(), JSON.stringify(s));
  } catch {
    // penyimpanan penuh / diblokir: riwayat demo hanya di memori
  }
};

const now = () => new Date().toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_TITLE = 'Percakapan baru';
const titleFrom = (t: string) => {
  const line = t.split(/\s+/).join(' ');
  return line.length <= 60 ? line : `${line.slice(0, 60).replace(/\s+\S*$/, '')}…`;
};

/** Jawaban demo singkat untuk pertanyaan contoh. Selain itu jawaban jujur bahwa model belum tersambung. */
const DEMO_ANSWERS: { match: RegExp; answer: string }[] = [
  {
    match: /siklus air/i,
    answer: 'Siklus air adalah perjalanan air yang terus berulang. Matahari membuat air menguap. Uap air menjadi awan, lalu turun sebagai hujan. Air hujan meresap ke tanah dan kembali ke laut.',
  },
  {
    match: /persen/i,
    answer: 'Persen artinya per seratus. Kalau ada seratus permen dan sepuluh berwarna merah, berarti permen merah ada sepuluh persen. Lima puluh persen sama dengan setengah.',
  },
  {
    match: /rekomendasi|materi kelas/i,
    answer: 'Coba materi Siklus Air untuk IPA dan Mengenal Persentase untuk Matematika. Keduanya ada di Beranda. Mau aku jelaskan salah satunya?',
  },
  {
    match: /latihan|soal/i,
    answer: 'Ayo latihan. Ada dua puluh siswa. Lima siswa memakai baju merah. Berapa persen siswa yang memakai baju merah? Coba jawab dulu, ya.',
  },
  {
    match: /persegi/i,
    answer: 'Persegi punya empat sisi yang sama panjang. Persegi panjang punya dua sisi panjang dan dua sisi pendek. Keduanya punya empat sudut siku.',
  },
  { match: /^(halo|hai|selamat)/i, answer: 'Halo! Aku ISYARA, teman belajarmu. Mau belajar apa hari ini?' },
];
const DEMO_FALLBACK =
  'Ini mode demo, jadi aku belum tersambung ke model AI dan belum bisa menjawab pertanyaan ini. Pertanyaanmu sudah tersimpan di riwayat. Coba tanya tentang siklus air atau persentase.';

function getOrThrow(s: Store, id: string) {
  const session = s.sessions.find((x) => x.id === id);
  if (!session) throw new ChatError('Percakapan tidak ditemukan', 'not-found');
  return session;
}

export const mockChatService: ChatService = {
  async listSessions() {
    return [...load().sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async getMessages(id) {
    const s = load();
    return { session: getOrThrow(s, id), messages: s.messages[id] ?? [] };
  },
  async createSession(title) {
    const s = load();
    const t = now();
    const session: ChatSession = { id: uid() + uid(), title: title ? titleFrom(title) : DEFAULT_TITLE, createdAt: t, updatedAt: t };
    s.sessions.push(session);
    s.messages[session.id] = [];
    save(s);
    return session;
  },
  async send(id, content, inputMode) {
    await wait(700 + Math.random() * 700);
    const s = load();
    const session = getOrThrow(s, id);
    const list = s.messages[id] ?? [];
    const answer = DEMO_ANSWERS.find((a) => a.match.test(content.trim()))?.answer ?? DEMO_FALLBACK;
    const user: ChatMessage = { id: uid(), role: 'user', content, inputMode, createdAt: now() };
    const assistant: ChatMessage = { id: uid(), role: 'assistant', content: answer, inputMode: null, createdAt: now() };
    if (list.length === 0 && session.title === DEFAULT_TITLE) session.title = titleFrom(content);
    session.updatedAt = assistant.createdAt;
    s.messages[id] = [...list, user, assistant];
    save(s);
    return { session: { ...session }, user, assistant, model: 'demo' };
  },
  async rename(id, title) {
    const s = load();
    const session = getOrThrow(s, id);
    session.title = titleFrom(title);
    save(s);
    return { ...session };
  },
  async remove(id) {
    const s = load();
    getOrThrow(s, id);
    s.sessions = s.sessions.filter((x) => x.id !== id);
    delete s.messages[id];
    save(s);
  },
};

export const chatService: ChatService = APP.authMode === 'api' ? httpChatService : mockChatService;
export const isMockChat = APP.authMode !== 'api';
