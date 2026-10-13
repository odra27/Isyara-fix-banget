import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { uid } from '@/lib/utils';
import { ChatError, chatService, type ChatMessage, type ChatSession, type InputMode } from './chat.service';

/** Pesan di layar: pesan tersimpan + pesan yang sedang/gagal dikirim (belum tersimpan). */
export type ViewMessage = ChatMessage & { status?: 'sending' | 'failed'; fresh?: boolean };

const ERROR_TEXT: Record<ChatError['kind'], string> = {
  auth: 'Sesi berakhir. Silakan masuk lagi.',
  'not-found': 'Percakapan ini sudah tidak ada.',
  model: 'ISYARA belum bisa menjawab sekarang. Coba kirim lagi sebentar lagi.',
  timeout: 'Jawaban terlalu lama. Coba kirim lagi.',
  network: 'Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.',
  server: 'Terjadi gangguan di server. Coba lagi sebentar.',
};

/**
 * State chatbot: daftar sesi (riwayat), sesi aktif, pesan, kirim dengan status optimistis.
 * Sesi baru baru dibuat di server saat pesan pertama dikirim, jadi "Chat baru" tidak meninggalkan
 * sesi kosong di riwayat.
 */
export function useChat(activeId: string | null, onSessionCreated: (id: string) => void) {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastModel, setLastModel] = useState<string | null>(null);
  /** id sesi yang baru saja dibuat oleh send(): pesannya sudah ada di layar, jangan dimuat ulang. */
  const justCreated = useRef<string | null>(null);

  const fail = useCallback(
    (e: unknown) => {
      const err = e instanceof ChatError ? e : new ChatError('unknown', 'server');
      // 'auth' = token ditolak meski sudah diperbarui (403: bukan akun siswa aktif) → form login.
      if (err.kind === 'auth') logout('expired');
      setError(ERROR_TEXT[err.kind]);
      return err;
    },
    [logout],
  );

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await chatService.listSessions());
    } catch (e) {
      fail(e);
    } finally {
      setSessionsLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  // Muat pesan saat sesi aktif berganti.
  useEffect(() => {
    setError(null);
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (justCreated.current === activeId) {
      justCreated.current = null;
      return;
    }
    let alive = true;
    setMessagesLoading(true);
    chatService
      .getMessages(activeId)
      .then((r) => alive && setMessages(r.messages))
      .catch((e) => alive && (fail(e), setMessages([])))
      .finally(() => alive && setMessagesLoading(false));
    return () => {
      alive = false;
    };
  }, [activeId, fail]);

  const upsertSession = (s: ChatSession) => setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);

  const send = useCallback(
    async (content: string, inputMode: InputMode, retryOf?: string) => {
      const text = content.trim();
      if (!text || sending) return false;
      setError(null);
      setSending(true);
      const tempId = retryOf ?? `tmp-${uid()}`;
      const pending: ViewMessage = { id: tempId, role: 'user', content: text, inputMode, createdAt: new Date().toISOString(), status: 'sending' };
      setMessages((prev) => (retryOf ? prev.map((m) => (m.id === retryOf ? pending : m)) : [...prev, pending]));
      try {
        let sid = activeId;
        if (!sid) {
          const created = await chatService.createSession();
          sid = created.id;
          upsertSession(created);
          justCreated.current = sid;
          onSessionCreated(sid);
        }
        const r = await chatService.send(sid, text, inputMode);
        setLastModel(r.model);
        setMessages((prev) => [...prev.filter((m) => m.id !== tempId), r.user, { ...r.assistant, fresh: true }]);
        upsertSession(r.session);
        return true;
      } catch (e) {
        fail(e);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        return false;
      } finally {
        setSending(false);
      }
    },
    [activeId, sending, fail, onSessionCreated],
  );

  const retry = useCallback(
    (m: ViewMessage) => send(m.content, m.inputMode ?? 'text', m.id),
    [send],
  );

  const discard = useCallback((id: string) => setMessages((prev) => prev.filter((m) => m.id !== id)), []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await chatService.remove(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [fail],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        const s = await chatService.rename(id, title);
        setSessions((prev) => prev.map((x) => (x.id === id ? s : x)));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  return {
    sessions,
    sessionsLoading,
    messages,
    messagesLoading,
    sending,
    error,
    clearError: () => setError(null),
    lastModel,
    send,
    retry,
    discard,
    remove,
    rename,
  };
}
