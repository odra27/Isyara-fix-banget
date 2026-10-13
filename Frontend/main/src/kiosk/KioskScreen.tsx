import { AnimatePresence, motion } from 'framer-motion';
import { Hand, MessagesSquare, Mic } from 'lucide-react';
import { SlideTabs, type SlideTab } from '@/components/ui/slide-tabs';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FallbackNotices } from '@/components/kiosk/FallbackNotice';
import { HistoryPanel } from '@/components/kiosk/HistoryPanel';
import { JbiOverlay } from '@/components/kiosk/JbiOverlay';
import { KioskHeader } from '@/components/kiosk/KioskHeader';
import { SignPanel } from '@/features/sign-to-text/SignPanel';
import { SpeechPanel } from '@/features/speech-to-sign/SpeechPanel';
import { SimulatorPanel } from '@/dev/SimulatorPanel';
import { KioskProvider, useKiosk } from '@/state/KioskContext';
import type { TabId } from '@/types/kiosk';
import { isDevMode } from '@/lib/utils';

const PANEL_LABELS: Record<TabId, string> = { pasien: 'Pasien', petugas: 'Petugas', percakapan: 'Riwayat' };

const TITLES: Record<TabId, { eyebrow: string; title: string }> = {
  pasien: { eyebrow: 'Pasien → petugas', title: 'Isyarat jadi teks dan suara' },
  petugas: { eyebrow: 'Petugas → pasien', title: 'Suara jadi video isyarat' },
  percakapan: { eyebrow: 'Sesi ini', title: 'Riwayat percakapan' },
};

function Kiosk() {
  const k = useKiosk();
  const pasienCount = k.conversation.filter((c) => c.from !== 'sistem').length;

  const tabs: SlideTab<TabId>[] = [
    { id: 'pasien', label: 'Pasien', icon: <Hand className="size-[1.1rem]" /> },
    { id: 'petugas', label: 'Petugas', icon: <Mic className="size-[1.1rem]" /> },
    { id: 'percakapan', label: 'Riwayat', icon: <MessagesSquare className="size-[1.1rem]" />, badge: pasienCount || undefined },
  ];

  const t = TITLES[k.tab];

  return (
    <div className="flex min-h-dvh flex-col" data-kiosk-tab={k.tab} data-escalated={k.escalated || undefined}>
      <KioskHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-28 pt-5 md:px-6 md:pt-8">
        <div className="mb-5 flex flex-col gap-4 md:mb-7 md:flex-row md:items-end md:justify-between">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={k.tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.16em] text-brand-600">{t.eyebrow}</p>
              <h1 className="mt-1 text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.045em] md:text-[2.5rem]">{t.title}</h1>
            </motion.div>
          </AnimatePresence>
          <SlideTabs tabs={tabs} value={k.tab} onChange={k.setTab} idPrefix="kiosk" className="self-center md:self-auto" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={k.tab}
            role="tabpanel"
            id={`kiosk-panel-${k.tab}`}
            aria-labelledby={`kiosk-tab-${k.tab}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Satu boundary per panel: crash di satu alur tidak mematikan alur lain (PRD-FE §9). */}
            <ErrorBoundary label={PANEL_LABELS[k.tab]} resetKey={k.tab}>
              {k.tab === 'pasien' && <SignPanel />}
              {k.tab === 'petugas' && <SpeechPanel />}
              {k.tab === 'percakapan' && <HistoryPanel />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="pb-6 text-center text-[0.6875rem] text-muted">
        AI membantu mengenali sejumlah frasa BISINDO yang telah divalidasi untuk skenario layanan Puskesmas.
      </footer>

      {/* Lapisan notifikasi/overlay: kalau crash cukup menghilang, alur utama tetap jalan. */}
      <ErrorBoundary level="quiet" label="Notifikasi fallback">
        <FallbackNotices />
      </ErrorBoundary>
      <ErrorBoundary level="quiet" label="Overlay JBI">
        <JbiOverlay />
      </ErrorBoundary>
      {isDevMode() && (
        <ErrorBoundary level="quiet" label="Simulator">
          <SimulatorPanel />
        </ErrorBoundary>
      )}
    </div>
  );
}

/**
 * Layar kiosk (rute `/` dan `/kiosk`). State kiosk dibuat ulang setiap kali layar dibuka.
 * `preview` = sedang ditampilkan buram di balik LoginGate (belum login): kamera/mic
 * tidak dinyalakan.
 */
export function KioskScreen({ preview = false }: { preview?: boolean }) {
  return (
    <KioskProvider preview={preview}>
      <Kiosk />
    </KioskProvider>
  );
}
