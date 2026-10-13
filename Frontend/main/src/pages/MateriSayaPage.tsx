import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, History } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { MateriCard } from '@/components/materi/MateriCard';
import { materiById, type Materi } from '@/data/materi';
import { PageHeader } from '@/layout/PageHeader';
import { useMateriStore } from '@/state/materi.store';

/** Materi Saya: materi yang disimpan + terakhir dibuka (per siswa, di perangkat ini). */
export default function MateriSayaPage() {
  const { profile } = useAuth();
  const store = useMateriStore(profile!.id);
  const saved = store.saved.map(materiById).filter(Boolean) as Materi[];
  const recent = store.recent.map((r) => materiById(r.id)).filter(Boolean) as Materi[];

  return (
    <div>
      <PageHeader eyebrow="Materi Saya" title="Lanjutkan belajarmu" subtitle="Materi yang kamu simpan dan yang terakhir kamu buka." />

      <Section icon={<Bookmark className="size-4" aria-hidden="true" />} title="Disimpan" empty="Belum ada materi yang disimpan. Tekan Simpan saat membuka materi.">
        {saved.map((m, i) => (
          <MateriCard key={m.id} m={m} index={i} saved />
        ))}
      </Section>

      <Section icon={<History className="size-4" aria-hidden="true" />} title="Terakhir dibuka" empty="Materi yang kamu buka akan muncul di sini.">
        {recent.map((m, i) => (
          <MateriCard key={m.id} m={m} index={i} saved={store.isSaved(m.id)} />
        ))}
      </Section>
    </div>
  );
}

function Section({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mb-9">
      <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-[-0.02em]">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
        {title}
        {children.length > 0 && <span className="text-sm font-bold text-muted">{children.length}</span>}
      </h2>
      {children.length === 0 ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-sm text-muted">
          {empty}{' '}
          <Link to="/" className="font-bold text-brand-600 underline-offset-4 hover:underline">
            Lihat semua materi
          </Link>
        </motion.p>
      ) : (
        <motion.ul layout className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">{children}</AnimatePresence>
        </motion.ul>
      )}
    </section>
  );
}
