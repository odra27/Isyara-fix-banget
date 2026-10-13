import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { Avatar } from './Avatar';

const MAX_NAME = 24;

/**
 * Identitas petugas di pojok kanan atas kiosk + jalan kembali ke Dashboard
 * (Requirement 10).
 *
 * Ditempatkan pada barisnya sendiri di atas baris tombol header supaya posisi
 * "Panggil JBI" tidak bergeser sedikit pun — PRD mewajibkan tombol itu selalu
 * berada di tempat yang sama.
 */
export function PetugasStrip() {
  const { profile } = useAuth();
  if (!profile) return null;

  const full = profile.name?.trim() ?? '';
  const shown = full.length > MAX_NAME ? `${full.slice(0, MAX_NAME).trimEnd()}…` : full;

  return (
    <Link
      to="/dashboard"
      aria-label={`Petugas ${full || 'belum dikenali'}. Kembali ke Dashboard Petugas.`}
      className="group flex h-11 max-w-[13rem] items-center gap-2 rounded-2xl bg-brand-900 pl-3 pr-2 text-white transition-colors hover:bg-brand-800"
    >
      <span className="hidden truncate text-sm font-bold sm:inline">{shown || 'Petugas'}</span>
      <Avatar name={profile.name} photoUrl={profile.photoUrl} className="size-7" textClassName="text-[0.625rem]" />
      <ChevronRight className="size-4 shrink-0 text-brand-200 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
