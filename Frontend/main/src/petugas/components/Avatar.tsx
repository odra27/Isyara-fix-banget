import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf } from '../AuthContext';

/**
 * Avatar petugas. Menampilkan foto bila `photoUrl` tersedia dan berhasil dimuat;
 * jika tidak ada atau gagal dimuat, jatuh ke inisial nama (dan ikon netral bila nama
 * juga kosong). Dipakai di Identity_Card dashboard dan header kiosk.
 *
 * Pola ini membuat integrasi BE mulus: backend cukup mengisi photoUrl pada profil,
 * tanpa mengubah komponen pemanggil. Kegagalan memuat gambar tidak merusak tampilan.
 */
export function Avatar({
  name,
  photoUrl,
  className,
  textClassName,
}: {
  name?: string | null;
  photoUrl?: string | null;
  className?: string;
  textClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const initials = initialsOf(name);
  const showPhoto = !!photoUrl && !broken;

  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 font-extrabold text-brand-800', className)}
    >
      {showPhoto ? (
        <img
          src={photoUrl ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : initials ? (
        <span className={textClassName}>{initials}</span>
      ) : (
        <UserRound className="size-1/2 text-brand-600" />
      )}
    </span>
  );
}
