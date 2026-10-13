import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Hand, LogOut, RotateCcw, School, Type, Volume2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/auth/components/Avatar';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/layout/PageHeader';
import { TEXT_SCALE_LABEL, useSettings, type Settings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';

/** Pengaturan: profil siswa (dari sekolah, hanya baca), tampilan, isyarat & suara, keluar. */
export default function SettingsPage() {
  const { profile, logout } = useAuth();
  const s = useSettings();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState(false);

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Pengaturan" title="Atur ISYARA sesukamu" subtitle="Pengaturan tampilan tersimpan di perangkat ini." />

      <Card title="Profil" icon={<School className="size-4" />}>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={profile?.name} photoUrl={profile?.photoUrl} className="size-16" textClassName="text-lg" />
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Item label="Nama" value={profile?.name} />
            <Item label="NIS" value={profile?.nis} />
            <Item label="Kelas" value={profile?.className ?? '-'} />
            <Item label="Sekolah" value={profile?.school} wide />
          </dl>
        </div>
        <p className="mt-3 text-xs text-muted">Data profil diatur oleh sekolah. Hubungi wali kelas bila ada yang salah.</p>
      </Card>

      <Card title="Tampilan" icon={<Type className="size-4" />}>
        <Choice
          label="Ukuran teks"
          value={s.textScale}
          options={[0, 1, 2].map((v) => ({ value: v as Settings['textScale'], label: TEXT_SCALE_LABEL[v] }))}
          onChange={(textScale) => s.update({ textScale })}
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
        <Toggle
          label="Putar isyarat otomatis"
          desc="Jawaban chatbot yang baru langsung diperagakan."
          checked={s.autoPlaySign}
          onChange={(autoPlaySign) => s.update({ autoPlaySign })}
        />
        <Toggle
          icon={<Volume2 className="size-4" />}
          label="Bacakan jawaban otomatis"
          desc="Untuk teman atau guru yang mendengar. Bisa tetap dibacakan manual lewat tombol Dengarkan."
          checked={s.autoSpeak}
          onChange={(autoSpeak) => s.update({ autoSpeak })}
        />
        <Button variant="ghost" size="sm" className="mt-1" onClick={s.reset}>
          <RotateCcw /> Kembalikan ke awal
        </Button>
      </Card>

      <Card title="Akun" icon={<LogOut className="size-4" />}>
        <p className="text-sm text-muted">Keluar dari akun di perangkat ini. Riwayat chat tetap tersimpan di akunmu.</p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            if (logout()) navigate('/login', { replace: true });
            else setLogoutError(true);
          }}
        >
          <LogOut /> Keluar
        </Button>
        {logoutError && (
          <p role="alert" className="mt-2 text-sm font-semibold text-rec">
            Gagal keluar. Tutup browser atau hapus data situs ini.
          </p>
        )}
      </Card>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4 rounded-[1.75rem] border border-line bg-white p-5 md:p-6"
    >
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

function Item({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={cn(wide && 'col-span-2 sm:col-span-3')}>
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="font-extrabold text-brand-900">{value || '-'}</dd>
    </div>
  );
}

function Choice<T extends number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                'cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-400',
                on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-brand-800 hover:border-brand-200',
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
        <motion.span
          className="absolute top-1 size-5 rounded-full bg-white shadow"
          animate={{ left: checked ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </label>
  );
}
