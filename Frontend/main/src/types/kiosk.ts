/** Tipe bersama untuk seluruh fitur kiosk. Bentuk data mengikuti kontrak API di SYSTEM_DESIGN.md §4. */

export type Landmark = [x: number, y: number, z: number];

/** Satu frame hasil hand tracking. `hands` berisi 0–2 tangan, masing-masing 21 landmark. */
export type HandFrame = {
  t: number;
  /** Semua tangan yang terdeteksi MediaPipe (maks 2), urutan slot detektor. Dikirim apa adanya ke model. */
  hands: Landmark[][];
  /** Sisi tiap tangan dari MediaPipe (`r.handedness[i][0].categoryName`), sejajar dengan `hands`. */
  handedness?: ('Left' | 'Right')[];
  /** Skor handedness per tangan, sejajar dengan `hands`. */
  handScores?: number[];
  /**
   * true = tangan terangkat (bukan posisi istirahat). Hanya tangan terangkat yang memicu auto-capture
   * dan dihitung gerakannya. undefined = semua tangan dianggap terangkat.
   */
  raised?: boolean[];
  /** Pose MediaPipe 33 × [x, y, z, visibility], null bila tidak terdeteksi. Dipakai model untuk normalisasi bahu. */
  pose?: number[][] | null;
  /** Ukuran frame kamera asli (video.videoWidth/Height). */
  width?: number;
  height?: number;
  /** Confidence deteksi tangan tertinggi di frame ini (0–1). */
  score: number;
};

export type Direction = 'sign_to_text' | 'speech_to_sign';
/**
 * Nilai `escalated_to_jbi` tetap dipakai karena merupakan kontrak API BE (confidence < 0.60).
 * Sejak ADR-051 FE TIDAK lagi menawarkan JBI: artinya cukup "isyarat belum dikenali".
 */
export type MatchAction = 'accepted' | 'confirmed' | 'escalated_to_jbi';

/** Satu potongan kalimat guru / jawaban. phraseId null = kata di luar kosakata (diberi gerakan buatan). */
export type TextSegment = { phraseId: string | null; text: string };
export type MatchResult = {
  phraseId: string | null;
  phraseText: string | null;
  confidence: number;
  action: MatchAction;
  /** Hanya untuk arah speech_to_sign. */
  videoUrl?: string | null;
  /** Hanya untuk arah speech_to_sign: kalimat yang dipecah per kata, diputar berurutan. */
  segments?: TextSegment[];
};

export type LogEntry = {
  id: string;
  deviceId: string;
  direction: Direction;
  predictedPhraseId: string | null;
  confidence: number;
  resultedAction: MatchAction;
  createdAt: number;
  /** 'match' = dicatat endpoint match (BE), 'user' = aksi pengguna dikirim FE via /api/logs. */
  source: 'match' | 'user';
};

export type Speaker = 'siswa' | 'guru';
export type Channel = 'isyarat' | 'suara' | 'ketik' | 'pilih-manual';

/** Riwayat percakapan kiosk sesi ini. Hanya di memori, hilang saat halaman dimuat ulang (PRD §17). */
export type ConversationItem = {
  id: string;
  from: Speaker | 'sistem';
  text: string;
  channel?: Channel;
  confidence?: number;
  at: number;
};

export type TabId = 'siswa' | 'guru' | 'percakapan';

/** Alasan sebuah sisi beralih ke mode ketik/pilih manual (SYSTEM_DESIGN.md §9.5). */
export type FallbackReason = 'camera' | 'mic' | 'backend';
