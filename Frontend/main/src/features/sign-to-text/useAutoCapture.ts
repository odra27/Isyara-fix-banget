import { useCallback, useEffect, useRef, useState } from 'react';
import { captureDebug, initialCapture, stepCapture, type CaptureDebug, type CaptureEvent, type CapturePhase } from './autoCapture';
import { frameBus } from './frameBus';

/**
 * Menghubungkan frameBus → reducer murni autoCapture.
 * Re-render hanya saat phase berubah + debug di-throttle ~10 fps.
 */
export function useAutoCapture(enabled: boolean, onEvent: (e: CaptureEvent) => void) {
  const state = useRef(initialCapture());
  const [phase, setPhase] = useState<CapturePhase>('IDLE');
  const [debug, setDebug] = useState<CaptureDebug>(() => captureDebug(state.current, 0));
  const lastDebug = useRef(0);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  const reset = useCallback(() => {
    state.current = initialCapture();
    setPhase('IDLE');
    setDebug(captureDebug(state.current, 0));
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }
    return frameBus.on((frame, now) => {
      const { state: next, event } = stepCapture(state.current, frame, now);
      state.current = next;
      setPhase(next.phase);
      if (now - lastDebug.current > 100 || event) {
        lastDebug.current = now;
        setDebug(captureDebug(next, now));
      }
      if (event) cb.current(event);
    });
  }, [enabled, reset]);

  return { phase, debug, reset };
}
