import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, ChevronRight, FileText, History, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { VideoCard } from '@/components/materi/VideoCard';
import { materiById, type Materi } from '@/data/materi';
import { chatService, type StudentDocument } from '@/features/chatbot/chat.service';
import { PageHeader } from '@/layout/PageHeader';
import { useMateriStore } from '@/state/materi.store';

/** Materi Saya: PDF yang pernah diunggah (di akun), video yang disimpan, video terakhir dibuka. */
export default function MateriSayaPage() {
  const { profile } = useAuth();
  const store = useMateriStore(profile!.id);
  const saved = store.saved.map(materiById).filter(Boolean) as Materi[];
  const recent = store.recent.map((r) => materiById(r.id)).filter(Boolean) as Materi[];

  const [docs, setDocs] = useState<StudentDocument[] | null>(null);
  const [docsFailed, setDocsFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    chatService
      .listDocuments()
      .then((d) => alive && setDocs(d))
      .catch(() => alive && (setDocsFailed(true), setDocs([])));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <PageHeader eyebrow="Materi Saya" title="Semua materimu di satu tempat" subtitle="PDF dari gurumu, video yang kamu simpan, dan yang terakhir kamu tonton." />

      <Section icon={<FileText className="size-4" aria-hidden="true" />} title="Materi PDF" count={docs?.length ?? 0}>
        {docs === null ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
            <LoaderCircle className="size-4 anim-spin" aria-hidden="true" /> Memuat…
          </p>
        ) : docsFailed ? (
          <p role="alert" className="mt-3 flex items-center gap-2 rounded-2xl bg-rec-soft px-4 py-3 text-sm font-semibold text-rec">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> Tidak bisa terhubung ke server.
          </p>
        ) : docs.length === 0 ? (
          <Empty>
            Belum ada PDF. Di{' '}
            <Link to="/chat" className="font-bold text-brand-600 hover:underline">
              Tanya ISYARA
            </Link>
            , tekan tombol klip lalu pilih PDF materi dari gurumu.
          </Empty>
        ) : (
          <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
            {docs.map((d, i) => (
              <motion.li key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                <Link
                  to={`/chat/${d.sessionId}`}
                  className="group flex items-center gap-3 rounded-2xl border border-line bg-white p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rec-soft text-rec">
                    <FileText className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-brand-900">{d.filename}</span>
                    <span className="block truncate text-xs text-muted">
                      {d.pageCount} halaman · {d.sessionTitle}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-brand-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Bookmark className="size-4" aria-hidden="true" />} title="Video disimpan" count={saved.length}>
        {saved.length === 0 ? (
          <Empty>
            Belum ada video yang disimpan. Tekan Simpan saat menonton di{' '}
            <Link to="/video" className="font-bold text-brand-600 hover:underline">
              Video Pelajaran
            </Link>
            .
          </Empty>
        ) : (
          <Grid>
            {saved.map((m, i) => (
              <VideoCard key={m.id} m={m} index={i} saved progress={store.progress[m.id]} />
            ))}
          </Grid>
        )}
      </Section>

      <Section icon={<History className="size-4" aria-hidden="true" />} title="Terakhir ditonton" count={recent.length}>
        {recent.length === 0 ? (
          <Empty>Video yang kamu buka akan muncul di sini.</Empty>
        ) : (
          <Grid>
            {recent.map((m, i) => (
              <VideoCard key={m.id} m={m} index={i} saved={store.isSaved(m.id)} progress={store.progress[m.id]} />
            ))}
          </Grid>
        )}
      </Section>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-[-0.02em]">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
        {title}
        {count > 0 && <span className="text-sm font-bold text-muted">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-sm text-muted">
      {children}
    </motion.p>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <motion.ul layout className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <AnimatePresence mode="popLayout">{children}</AnimatePresence>
    </motion.ul>
  );
}
