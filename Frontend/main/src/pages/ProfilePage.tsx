import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Captions, CheckCircle2, FileText, GraduationCap, Hand, IdCard, LogOut, MessageCircleQuestion, PlayCircle, RotateCcw, School, TriangleAlert, Type, Volume2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/auth/components/Avatar';
import { Button } from '@/components/ui/button';
import { chatService, type ChatActivity } from '@/features/chatbot/chat.service';
import { sessionsStore } from '@/features/chatbot/sessions.store';
import { useMateriStore } from '@/state/materi.store';
import { CAPTION_SIZE_LABEL, TEXT_SCALE_LABEL, useSettings, type Settings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';

const BELUM_ADA = 'Belum tersedia';

/**
 * Profil siswa: kartu identitas (kiri, gaya kartu awan), Kegiatan belajarku + pengaturan (kanan).
 * Data profil dari sekolah (hanya baca). "Pertanyaan dari video" hanya menghitung pertanyaan yang
 * dikirim dari halaman video (chat biasa tidak dihitung, ADR-053).
 */
export default function ProfilePage() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState(false);
  if (!profile) return null;
  const first = profile.name.split(' ')[0];

  const onLogout = () => {
    if (logout()) {
      sessionsStore.reset();
      navigate('/login', { replace: true });
    } else setLogoutError(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
      <motion.section
        aria-label="Identitas siswa"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative isolate overflow-hidden rounded-[1.75rem] bg-white p-6 shadow-soft lg:sticky lg:top-8"
      >
        <CloudBackdrop />
        <div className="relative flex flex-col items-center text-center">
          <Avatar name={first} photoUrl={profile.photoUrl} className="size-28 ring-4 ring-white shadow-soft" textClassName="text-[2.5rem]" />
          <h1 className="mt-4 text-xl font-extrabold tracking-[-0.03em] text-brand-950">{profile.name}</h1>
          <p className="mt-0.5 text-sm font-semibold text-brand-800">{profile.className ? `Siswa Kelas ${profile.className}` : 'Siswa'}</p>
          <span className="mt-2.5 rounded-full bg-white px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-brand-600 shadow-soft">Siswa</span>
        </div>
        <hr className="relative my-5 border-line" />
        <dl className="relative flex flex-col gap-4">
          <InfoRow icon={<IdCard className="size-[1.1rem]" />} label="NIS" value={profile.nis?.trim() || BELUM_ADA} />
          <InfoRow icon={<School className="size-[1.1rem]" />} label="Sekolah" value={profile.school?.trim() || BELUM_ADA} />
          <InfoRow
            icon={<GraduationCap className="size-[1.1rem]" />}
            label="Kelas"
            value={profile.className ? `${profile.className}${profile.grade ? ` · Kelas ${profile.grade}` : ''}` : BELUM_ADA}
          />
        </dl>
        <p className="relative mt-4 text-xs text-muted">Data profil diatur oleh sekolah. Hubungi wali kelas bila ada yang salah.</p>
        <div className="relative mt-5 border-t border-line pt-5">
          <Button variant="outline" size="md" onClick={onLogout} className="w-full">
            <LogOut aria-hidden="true" /> Keluar
          </Button>
          <div aria-live="polite" role="status">
            {logoutError && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-rec">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Gagal keluar karena penyimpanan perangkat terkunci. Coba lagi atau tutup peramban.
              </p>
            )}
          </div>
        </div>
      </motion.section>

      <div className="flex min-w-0 flex-col gap-5">
        <Activity studentId={profile.id} />
        <SettingsCards />
      </div>
    </div>
  );
}

function CloudBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-44 overflow-hidden rounded-t-[1.75rem]"
      style={{ maskImage: 'linear-gradient(to bottom, #000 90%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 90%, transparent)' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-brand-100/70 via-brand-50/70 to-white" />
      <img
        src="/petugas/card-clouds.jpg"
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover object-center opacity-55"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-white/35 to-white/85" />
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-bold text-brand-900">{value}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Kegiatan belajarku

function Activity({ studentId }: { studentId: string }) {
  const store = useMateriStore(studentId);
  const [a, setA] = useState<ChatActivity | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    chatService
      .activity()
      .then((r) => alive && setA(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const done = Object.values(store.progress).filter((p) => p.done).length;
  const watching = Object.values(store.progress).filter((p) => !p.done).length;

  const stats = [
    { icon: CheckCircle2, label: 'Video selesai', value: String(done), tone: 'text-ok-ink bg-ok-soft' },
    { icon: PlayCircle, label: 'Sedang ditonton', value: String(watching), tone: 'text-brand-600 bg-brand-50' },
    { icon: MessageCircleQuestion, label: 'Pertanyaan dari video', value: a ? String(a.videoQuestions) : failed ? '–' : '…', tone: 'text-[#7A5A00] bg-[#FFF4CC]' },
    { icon: FileText, label: 'PDF diunggah', value: a ? String(a.documents) : failed ? '–' : '…', tone: 'text-rec bg-rec-soft' },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.35 }}
      className="relative isolate overflow-hidden rounded-[1.75rem] bg-white p-6 shadow-soft md:p-7"
    >
      <div aria-hidden="true" className="absolute -bottom-24 -right-16 -z-10 size-[18rem] rounded-full bg-tint" />
      <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.16em] text-brand-600">Kegiatan belajarku</p>
      <h2 className="mt-1 text-[1.5rem] font-extrabold leading-tight tracking-[-0.035em]">7 hari terakhir</h2>
      <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.li
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="rounded-2xl border border-line bg-white p-3.5"
          >
            <span className={cn('grid size-9 place-items-center rounded-xl', s.tone)}>
              <s.icon className="size-[1.1rem]" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[1.6rem] font-extrabold leading-none tabular-nums text-brand-950">{s.value}</p>
            <p className="mt-1 text-xs font-semibold text-muted">{s.label}</p>
          </motion.li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Pertanyaan dihitung hanya bila dikirim saat menonton video. Video yang selesai dan sedang ditonton tercatat di perangkat ini.{' '}
        <Link to="/video" className="font-bold text-brand-600 hover:underline">
          Lanjutkan menonton
        </Link>
      </p>
    </motion.section>
  );
}

// ---------------------------------------------------------------- pengaturan

function SettingsCards() {
  const s = useSettings();
  return (
    <>
      <Card title="Tampilan & caption" icon={<Type className="size-4" />}>
        <Choice
          label="Ukuran teks"
          value={s.textScale}
          options={[0, 1, 2].map((v) => ({ value: v as Settings['textScale'], label: TEXT_SCALE_LABEL[v] }))}
          onChange={(textScale) => s.update({ textScale })}
        />
        <Choice
          label="Ukuran caption"
          value={s.captionSize}
          options={(['S', 'M', 'L'] as const).map((v) => ({ value: v, label: CAPTION_SIZE_LABEL[v] }))}
          onChange={(captionSize) => s.update({ captionSize })}
        />
        <Toggle
          icon={<Captions className="size-4" />}
          label="Tampilkan caption"
          desc="Teks muncul di atas animasi isyarat dan video, kata yang sedang diisyaratkan disorot kuning."
          checked={s.captions}
          onChange={(captions) => s.update({ captions })}
        />
      </Card>

      <Card title="Isyarat & suara" icon={<Hand className="size-4" />}>
        <Choice
          label="Kecepatan animasi isyarat"
          value={s.signSpeed}
          options={[
            { value: 0.75, label: 'Pelan' },
            { value: 1, label: 'Normal' },
            { value: 1.25, label: 'Cepat' },
          ]}
          onChange={(signSpeed) => s.update({ signSpeed })}
        />
        <Toggle label="Putar isyarat otomatis" desc="Jawaban baru langsung diperagakan." checked={s.autoPlaySign} onChange={(autoPlaySign) => s.update({ autoPlaySign })} />
        <Toggle
          icon={<Volume2 className="size-4" />}
          label="Bacakan jawaban otomatis"
          desc="Untuk teman atau guru yang mendengar. Tetap bisa dibacakan lewat tombol Dengarkan."
          checked={s.autoSpeak}
          onChange={(autoSpeak) => s.update({ autoSpeak })}
        />
        <Button variant="ghost" size="sm" className="w-fit" onClick={s.reset}>
          <RotateCcw /> Kembalikan ke awal
        </Button>
      </Card>
    </>
  );
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-[1.75rem] border border-line bg-white p-5 md:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-extrabold">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </motion.section>
  );
}

function Choice<T extends number | string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={cn(
                'cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-400',
                on ? 'border-brand-900 bg-brand-900 text-white' : 'border-line bg-white text-brand-800 hover:border-brand-200',
              )}
            >
              <input type="radio" className="sr-only" name={label} checked={on} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Toggle({ label, desc, checked, onChange, icon }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; icon?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="flex items-center gap-1.5 text-sm font-bold">
          {icon}
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{desc}</span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-400',
          checked ? 'bg-brand-600' : 'bg-brand-100',
        )}
      >
        <motion.span className="absolute top-1 size-5 rounded-full bg-white shadow" animate={{ left: checked ? 24 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </span>
    </label>
  );
}
