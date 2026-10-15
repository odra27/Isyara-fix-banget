import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, MessageSquarePlus, MessagesSquare, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { chatService, type ChatSession } from '@/features/chatbot/chat.service';
import { sessionsStore, useSessions } from '@/features/chatbot/sessions.store';
import { PageHeader } from '@/layout/PageHeader';
import { cn } from '@/lib/utils';

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return 'Hari ini';
  if (days === 1) return 'Kemarin';
  if (days < 7) return '7 hari terakhir';
  return 'Lebih lama';
}

/** Riwayat: semua percakapan siswa (ganti nama, hapus). Sidebar hanya menampilkan 4 terakhir. */
export default function HistoryPage() {
  const s = useSessions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void sessionsStore.refresh();
  }, []);

  const rename = async (id: string) => {
    if (!title.trim()) return setEditing(null);
    try {
      sessionsStore.replace(await chatService.rename(id, title.trim()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setEditing(null);
  };
  const remove = async (id: string) => {
    try {
      await chatService.remove(id);
      sessionsStore.drop(id);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setConfirming(null);
  };

  const groups: { label: string; items: ChatSession[] }[] = [];
  for (const x of s.sessions) {
    const label = groupLabel(x.updatedAt);
    const g = groups.find((y) => y.label === label);
    if (g) g.items.push(x);
    else groups.push({ label, items: [x] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Riwayat"
        title="Percakapanmu"
        subtitle="Hanya teks yang disimpan. Video kamera tidak pernah direkam."
        actions={
          <Button onClick={() => navigate('/chat')}>
            <MessageSquarePlus /> Chat baru
          </Button>
        }
      />

      {(failed || (s.error && s.sessions.length === 0)) && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-2xl bg-rec-soft px-4 py-3 text-sm font-semibold text-rec">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> Tidak bisa terhubung ke server. Pastikan server menyala, lalu coba lagi.
        </p>
      )}

      {!s.loaded ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-14 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : s.sessions.length === 0 && !s.error ? (
        <div className="grid place-items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-10 text-center">
          <MessagesSquare className="size-8 text-brand-200" aria-hidden="true" />
          <p className="mt-3 font-extrabold">Belum ada percakapan</p>
          <p className="mt-1 text-sm text-muted">Pertanyaan pertamamu akan tersimpan di sini.</p>
          <Link to="/chat" className="mt-3 text-sm font-bold text-brand-600 hover:underline">
            Tanya ISYARA sekarang
          </Link>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mb-6">
            <h2 className="mb-2 px-1 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-muted">{g.label}</h2>
            <ul className="overflow-hidden rounded-3xl border border-line bg-white">
              <AnimatePresence initial={false}>
                {g.items.map((x) => (
                  <motion.li key={x.id} layout exit={{ opacity: 0, height: 0 }} className="group relative border-b border-line last:border-b-0">
                    {editing === x.id ? (
                      <form
                        className="flex items-center gap-2 p-2.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void rename(x.id);
                        }}
                      >
                        <label htmlFor={`rename-${x.id}`} className="sr-only">
                          Nama percakapan
                        </label>
                        <input
                          id={`rename-${x.id}`}
                          autoFocus
                          value={title}
                          maxLength={120}
                          onChange={(e) => setTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-tint px-3 text-sm focus:border-brand-400 focus:outline-none"
                        />
                        <Button type="submit" size="sm">
                          <Check /> Simpan
                        </Button>
                      </form>
                    ) : confirming === x.id ? (
                      <div className="flex items-center gap-2 bg-rec-soft p-2.5 pl-4 text-sm font-bold text-rec">
                        <span className="flex-1">Hapus “{x.title}”?</span>
                        <button type="button" onClick={() => void remove(x.id)} className="rounded-xl bg-rec px-3 py-2 text-white">
                          Hapus
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="rounded-xl px-3 py-2 hover:bg-white/60">
                          Batal
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link to={`/chat/${x.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 pr-24 transition-colors hover:bg-tint">
                          <MessagesSquare className="size-4 shrink-0 text-brand-400" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-brand-900">{x.title}</span>
                            <span className="block text-xs text-muted">
                              {new Date(x.updatedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </span>
                        </Link>
                        <span
                          className={cn(
                            'absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity',
                            'group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setTitle(x.title);
                              setEditing(x.id);
                            }}
                            aria-label={`Ganti nama ${x.title}`}
                            className="grid size-9 place-items-center rounded-xl text-muted hover:bg-white hover:text-brand-800"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(x.id)}
                            aria-label={`Hapus ${x.title}`}
                            className="grid size-9 place-items-center rounded-xl text-muted hover:bg-white hover:text-rec"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </span>
                      </>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
