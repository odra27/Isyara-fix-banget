import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDevMode } from '@/lib/utils';

/**
 * Error boundary kiosk (PRD-FE §9: aplikasi tidak boleh blank kalau satu modul crash).
 *
 * Tiga level pemakaian:
 *  - 'app'   : jaring terakhir di main.tsx. Layar penuh + tombol muat ulang.
 *  - 'panel' : membungkus satu panel alur. Panel lain & kerangka kiosk tetap hidup,
 *              petugas/pasien bisa pindah tab untuk melanjutkan percakapan.
 *  - 'quiet' : lapisan hiasan/notifikasi (overlay, simulator). Kalau crash cukup hilang
 *              tanpa menutupi alur utama.
 *
 * Catatan: boundary hanya menangkap error saat render/lifecycle. Error di event handler
 * atau kode async tetap perlu try/catch sendiri (lihat fallback kamera/mic di §8).
 */
type Level = 'app' | 'panel' | 'quiet';

type Props = {
  children: ReactNode;
  /** Nama bagian, dipakai di pesan fallback dan log. Mis. "Pasien". */
  label?: string;
  level?: Level;
  /** Bila nilainya berubah, boundary otomatis pulih (mis. saat pindah tab). */
  resetKey?: unknown;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Tidak dikirim ke server: crash report bisa memuat data percakapan pasien.
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private reset = () => this.setState({ error: null });

  private detail() {
    // Pesan teknis hanya untuk mode dev (?dev=1) — pasien & petugas tidak perlu lihat stack trace.
    if (!isDevMode() || !this.state.error) return null;
    return (
      <pre className="mt-1 max-w-full overflow-x-auto rounded-xl bg-brand-50 p-3 text-left text-[0.6875rem] leading-relaxed text-brand-800">
        {this.state.error.message}
      </pre>
    );
  }

  render() {
    const { children, label, level = 'panel' } = this.props;
    if (!this.state.error) return children;

    if (level === 'quiet') return null;

    if (level === 'app') {
      return (
        <div role="alert" className="grid min-h-dvh place-items-center bg-tint p-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <span className="grid size-16 place-items-center rounded-3xl bg-rec-soft text-rec">
              <TriangleAlert className="size-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.035em]">Kiosk perlu dimuat ulang</h1>
              <p className="mt-2 text-sm text-muted">
                Terjadi gangguan teknis. Riwayat percakapan sesi ini tidak tersimpan. Bila perlu bantuan segera, minta petugas memanggil JBI.
              </p>
            </div>
            <Button size="lg" onClick={() => window.location.reload()}>
              <RotateCcw aria-hidden="true" /> Muat ulang kiosk
            </Button>
            {this.detail()}
          </div>
        </div>
      );
    }

    return (
      <div role="alert" className="grid min-h-64 place-items-center rounded-3xl border-2 border-dashed border-line bg-white p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-rec-soft text-rec">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </span>
          <p className="text-lg font-extrabold">{label ? `Bagian ${label} bermasalah` : 'Bagian ini bermasalah'}</p>
          <p className="text-sm text-muted">
            Bagian kiosk yang lain tetap bisa dipakai. Coba muat ulang bagian ini, atau pindah tab untuk melanjutkan percakapan.
          </p>
          <Button variant="soft" onClick={this.reset}>
            <RotateCcw aria-hidden="true" /> Coba lagi
          </Button>
          {this.detail()}
        </div>
      </div>
    );
  }
}
