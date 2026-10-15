import { useEffect, useState, type RefObject } from 'react';
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { buildHandFrame, type RawFrame } from './landmarkFrame';
import { frameBus } from './frameBus';

/**
 * MediaPipe Hand + Pose di browser → frameBus (SYSTEM_DESIGN.md §9.3).
 *
 * Aturan capture yang wajib (kalau tidak, akurasi turun):
 *   - MediaPipe dijalankan pada frame kamera ASLI (tidak di-mirror). Mirror hanya CSS preview.
 *   - Model .task sama dengan training (ml/mp_models, disalin ke public/mediapipe oleh scripts/copy-mediapipe.mjs).
 *   - Pose selalu dikirim + width/height asli kamera.
 *   - Timestamp detectForVideo selalu naik.
 * Setiap frame video di-emit, termasuk yang tanpa tangan (hands: []), agar stop "tangan hilang" terhitung
 * dan sekuens yang dikirim ke model utuh.
 */
const BASE = `${import.meta.env.BASE_URL}mediapipe`;

type Landmarkers = { hand: HandLandmarker; pose: PoseLandmarker };
let loading: Promise<Landmarkers> | null = null;

async function create(delegate: 'GPU' | 'CPU'): Promise<Landmarkers> {
  const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  // Nilai confidence = ml/config/default.yaml → extract:
  const hand = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${BASE}/models/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const pose = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${BASE}/models/pose_landmarker_lite.task`, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  return { hand, pose };
}

/** Dimuat sekali per halaman lalu dipakai ulang. GPU dulu, CPU bila WebGL tidak tersedia. */
export function loadLandmarkers(): Promise<Landmarkers> {
  loading ??= create('GPU').catch(() => create('CPU'));
  loading.catch(() => {
    loading = null; // izinkan coba lagi
  });
  return loading;
}

let lastTs = 0;
function nextTimestamp() {
  // detectForVideo menolak timestamp yang tidak naik.
  lastTs = Math.max(performance.now(), lastTs + 1);
  return lastTs;
}

export type TrackingStatus = 'loading' | 'ready' | 'error';

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [status, setStatus] = useState<TrackingStatus>('loading');
  const [lm, setLm] = useState<Landmarkers | null>(null);

  useEffect(() => {
    let alive = true;
    loadLandmarkers().then(
      (l) => alive && (setLm(l), setStatus('ready')),
      (e) => {
        console.error('[hand-tracking] gagal memuat MediaPipe', e);
        if (alive) setStatus('error');
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !lm || !video) return;
    let stopped = false;
    let raf = 0;
    let vfc = 0;
    let lastVideoTime = -1;

    const process = () => {
      if (stopped) return;
      if (!frameBus.liveMuted && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const ts = nextTimestamp();
        try {
          const h = lm.hand.detectForVideo(video, ts);
          const p = lm.pose.detectForVideo(video, ts);
          const raw: RawFrame = {
            hands: h.landmarks.slice(0, 2).map((pts, i) => ({
              landmarks: pts.map((q) => [q.x, q.y, q.z] as [number, number, number]),
              handedness: (h.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as 'Left' | 'Right',
              score: h.handedness[i]?.[0]?.score ?? 0,
            })),
            pose: p.landmarks[0]?.map((q) => [q.x, q.y, q.z, q.visibility ?? 1]) ?? null,
          };
          frameBus.emit(buildHandFrame(raw, ts, video.videoWidth, video.videoHeight), ts);
        } catch (e) {
          console.error('[hand-tracking] deteksi gagal', e);
        }
      }
      schedule();
    };

    const schedule = () => {
      if (stopped) return;
      if ('requestVideoFrameCallback' in video) vfc = video.requestVideoFrameCallback(process);
      else raf = requestAnimationFrame(process);
    };
    schedule();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (vfc && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(vfc);
    };
  }, [enabled, lm, videoRef]);

  return { ready: status === 'ready', status, source: 'mediapipe' as const };
}
