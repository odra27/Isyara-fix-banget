import { AnimatePresence, motion } from 'framer-motion';
import { Hand, MessagesSquare, Mic } from 'lucide-react';
import { SlideTabs, type SlideTab } from '@/components/ui/slide-tabs';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FallbackNotices } from '@/components/kiosk/FallbackNotice';
import { HistoryPanel } from '@/components/kiosk/HistoryPanel';
import { PageHeader } from '@/layout/PageHeader';
import { SignPanel } from '@/features/sign-to-text/SignPanel';
import { SpeechPanel } from '@/features/speech-to-sign/SpeechPanel';
import { SimulatorPanel } from '@/dev/SimulatorPanel';
import { KioskProvider, useKiosk } from '@/state/KioskContext';
import type { TabId } from '@/types/kiosk';
import { isDevMode } from '@/lib/utils';

const PANEL_LABELS: Record<TabId, string> = { siswa: 'Siswa', guru: 'Guru', percakapan: 'Riwayat' };

const TITLES: Record<TabId, { eyebrow: string; title: string }> = {
  siswa: { eyebrow: 'Siswa → guru', title: 'Isyarat jadi teks dan suara' },
  guru: { eyebrow: 'Guru → siswa', title: 'Suara jadi animasi isyarat' },
  percakapan: { eyebrow: 'Sesi ini', title: 'Riwayat percakapan' },
};

/**
 * Mode Kiosk kelas: satu perangkat, dua arah, antara siswa Tuli dan guru di kelas.
 * Ditampilkan di dalam AppShell (sidebar), jadi tidak punya header sendiri.
 */
function Kiosk() {
  const k = useKiosk();
  const count = k.conversation.filter((c) => c.from !== 'sistem').length;

  const tabs: SlideTab<TabId>[] = [
    { id: 'siswa', label: 'Siswa', icon: <Hand className="size-[1.1rem]" /> },
    { id: 'guru', label: 'Guru', icon: <Mic className="size-[1.1rem]" /> },
    { id: 'percakapan', label: 'Riwayat', icon: <MessagesSquare className="size-[1.1rem]" />, badge: count || undefined },
  ];

  const t = TITLES[k.tab];

  return (
    <div className="flex flex-col" data-kiosk-tab={k.tab}>
      <PageHeader
        eyebrow="Mode kiosk"
        title={t.title}
        subtitle={t.eyebrow}
        actions={<SlideTabs tabs={tabs} value={k.tab} onChange={k.setTab} idPrefix="kiosk" />}
      />

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
          <ErrorBoundary label={PANEL_LABELS[k.tab]} resetKey={k.tab}>
            {k.tab === 'siswa' && <SignPanel />}
            {k.tab === 'guru' && <SpeechPanel />}
            {k.tab === 'percakapan' && <HistoryPanel />}
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>

      <p className="mt-8 text-center text-[0.6875rem] text-muted">
        AI membantu mengenali sejumlah kosakata BISINDO yang telah divalidasi untuk kegiatan belajar.
      </p>

      <ErrorBoundary level="quiet" label="Notifikasi fallback">
        <FallbackNotices />
      </ErrorBoundary>
      {isDevMode() && (
        <ErrorBoundary level="quiet" label="Simulator">
          <SimulatorPanel />
        </ErrorBoundary>
      )}
    </div>
  );
}

/** Halaman Kiosk (`/kiosk`). State kiosk dibuat ulang setiap kali halaman dibuka. */
export function KioskScreen() {
  return (
    <KioskProvider>
      <Kiosk />
    </KioskProvider>
  );
}

export default KioskScreen;
