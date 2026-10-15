import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { uid } from '@/lib/utils';
import { ChatError, chatService, DOCUMENT_ERROR_TEXT, type ChatDocument, type ChatMessage, type InputMode, type VideoRef } from './chat.service';
import { sessionsStore, useSessions } from './sessions.store';

/** Pesan di layar: pesan tersimpan + pesan yang sedang/gagal dikirim (belum tersimpan). */
export type ViewMessage = ChatMessage & { status?: 'sending' | 'failed'; fresh?: boolean; video?: VideoRef | null };

const ERROR_TEXT: Record<ChatError['kind'], string> = {
  auth: 'Sesi berakhir. Silakan masuk lagi.',
  'not-found': 'Percakapan ini sudah tidak ada.',
  model: 'ISYARA belum bisa menjawab sekarang. Coba kirim lagi sebentar lagi.',
  timeout: 'Jawaban terlalu lama. Coba kirim lagi.',
  network: 'Tidak bisa terhubung ke server. Pastikan server menyala, lalu coba lagi.',
  server: 'Terjadi gangguan di server. Coba lagi sebentar.',
  document: 'File tidak bisa dipakai.',
};

/**
 * State satu percakapan: pesan, dokumen PDF, kirim dengan status optimistis. Daftar sesi ada di
 * sessionsStore (dipakai bersama sidebar). Sesi baru dibuat di server saat pesan pertama dikirim
 * (atau PDF pertama diunggah), jadi "Chat baru" tidak meninggalkan sesi kosong di riwayat.
 */
export function useChat(activeId: string | null, onSessionCreated: (id: string) => void, opts: { newTitle?: string } = {}) {
  const { logout } = useAuth();
  const sessions = useSessions();
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [documents, setDocuments] = useState<ChatDocument[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** id sesi yang baru saja dibuat oleh send()/upload(): isinya sudah di layar, jangan dimuat ulang. */
  const justCreated = useRef<string | null>(null);

  const fail = useCallback(
    (e: unknown) => {
      const err = e instanceof ChatError ? e : new ChatError('unknown', 'server');
      // 'auth' = token ditolak meski sudah diperbarui (403: bukan akun siswa aktif) → form login.
      if (err.kind === 'auth') logout('expired');
      setError(err.kind === 'document' ? DOCUMENT_ERROR_TEXT[err.code ?? ''] ?? ERROR_TEXT.document : ERROR_TEXT[err.kind]);
      return err;
    },
    [logout],
  );

  useEffect(() => {
    if (!sessions.loaded && !sessions.loading) void sessionsStore.refresh();
  }, [sessions.loaded, sessions.loading]);

  // Muat pesan saat sesi aktif berganti.
  useEffect(() => {
    setError(null);
    setNotFound(false);
    if (!activeId) {
      setMessages([]);
      setDocuments([]);
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
      .then((r) => {
        if (!alive) return;
        setMessages(r.messages);
        setDocuments(r.documents);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ChatError && e.kind === 'not-found') setNotFound(true);
        fail(e);
        setMessages([]);
        setDocuments([]);
      })
      .finally(() => alive && setMessagesLoading(false));
    return () => {
      alive = false;
    };
  }, [activeId, fail]);

  const ensureSession = useCallback(async () => {
    if (activeId) return activeId;
    const created = await chatService.createSession(opts.newTitle);
    sessionsStore.upsert(created);
    justCreated.current = created.id;
    onSessionCreated(created.id);
    return created.id;
  }, [activeId, onSessionCreated, opts.newTitle]);

  const send = useCallback(
    async (content: string, inputMode: InputMode, video?: VideoRef | null, retryOf?: string) => {
      const text = content.trim();
      if (!text || sending) return false;
      setError(null);
      setSending(true);
      const tempId = retryOf ?? `tmp-${uid()}`;
      const pending: ViewMessage = {
        id: tempId,
        role: 'user',
        content: text,
        inputMode,
        createdAt: new Date().toISOString(),
        status: 'sending',
        video: video ?? null,
        videoId: video?.id ?? null,
        videoTSec: video ? Math.round(video.tSec) : null,
      };
      setMessages((prev) => (retryOf ? prev.map((m) => (m.id === retryOf ? pending : m)) : [...prev, pending]));
      try {
        const sid = await ensureSession();
        const r = await chatService.send(sid, text, inputMode, video);
        setLastModel(r.model);
        setMessages((prev) => [...prev.filter((m) => m.id !== tempId), r.user, { ...r.assistant, fresh: true }]);
        sessionsStore.upsert(r.session);
        return true;
      } catch (e) {
        fail(e);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        return false;
      } finally {
        setSending(false);
      }
    },
    [sending, fail, ensureSession],
  );

  const retry = useCallback((m: ViewMessage) => send(m.content, m.inputMode ?? 'text', m.video, m.id), [send]);

  const discard = useCallback((id: string) => setMessages((prev) => prev.filter((m) => m.id !== id)), []);

  const upload = useCallback(
    async (file: File) => {
      if (uploading) return null;
      setError(null);
      setUploading(true);
      try {
        const sid = await ensureSession();
        const doc = await chatService.uploadDocument(sid, file);
        setDocuments((prev) => [...prev, doc]);
        void sessionsStore.refresh();
        return doc;
      } catch (e) {
        fail(e);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [uploading, ensureSession, fail],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await chatService.remove(id);
        sessionsStore.drop(id);
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
        sessionsStore.replace(await chatService.rename(id, title));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  return {
    sessions: sessions.sessions,
    sessionsLoading: !sessions.loaded,
    messages,
    documents,
    messagesLoading,
    notFound,
    sending,
    uploading,
    error,
    clearError: () => setError(null),
    lastModel,
    send,
    retry,
    discard,
    upload,
    remove,
    rename,
  };
}
