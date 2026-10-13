import { Type, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { APP } from '@/config/app.config';
import { isMockBackend } from '@/services/matching.service';
import { useKiosk } from '@/state/KioskContext';
import { PetugasStrip } from '@/petugas/components/PetugasStrip';

/**
 * Header kiosk. Satu baris: kiri logo, kanan [Teks] [Panggil JBI] [profil petugas].
 * Profil petugas berada di paling kanan, sejajar dengan tombol lain.
 */
export function KioskHeader() {
  const k = useKiosk();
  const scaleLabel = ['Normal', 'Besar', 'Sangat besar'][k.textScale];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <a href={APP.landingUrl} aria-label="ISYARA, ke halaman utama" className="flex items-center gap-3">
          <Logo />
          <span className="hidden items-center gap-1.5 rounded-full bg-tint px-2.5 py-1 text-[0.6875rem] font-bold text-brand-800 sm:flex">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
            {isMockBackend ? 'Mode demo' : 'Terhubung'}
          </span>
        </a>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={k.cycleTextScale} aria-label={`Ukuran teks: ${scaleLabel}. Ketuk untuk mengubah.`}>
            <Type />
            <span className="hidden sm:inline">Teks {scaleLabel.toLowerCase()}</span>
          </Button>
          <Button variant="ghost" size="md" onClick={() => k.callJbi(k.tab === 'petugas' ? 'speech_to_sign' : 'sign_to_text')}>
            <Users /> Panggil JBI
          </Button>
          <PetugasStrip />
        </div>
      </div>
    </header>
  );
}
