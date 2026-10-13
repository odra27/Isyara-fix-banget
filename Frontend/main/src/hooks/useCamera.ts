import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'ended';

/**
 * Kamera depan untuk Alur A. Video hanya ditampilkan live, TIDAK direkam/disimpan (PRD-FE §9).
 * Stream dihentikan saat komponen unmount.
 */
export function useCamera(opts: { onFailure?: (s: CameraStatus) => void } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const failRef = useRef(opts.onFailure);
  failRef.current = opts.onFailure;

  // Token untuk membuang hasil getUserMedia yang sudah basi (start dipanggil ulang / stop di tengah jalan).
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const fail = useCallback((s: CameraStatus) => {
    setStatus(s);
    failRef.current?.(s);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return fail('unavailable');
    stop();
    const my = ++token.current;
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (my !== token.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => fail('ended'));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('ready');
    } catch (e) {
      if (my !== token.current) return;
      const name = (e as DOMException).name;
      fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }, [fail]);

  useEffect(() => stop, [stop]);

  return { videoRef, status, start, stop };
}
