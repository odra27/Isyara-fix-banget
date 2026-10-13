import type { MatchAction } from '@/types/kiosk';

/** Decision boundary PRD §10. Berlaku untuk kedua arah. */
export const CONFIDENCE = { accept: 0.85, confirm: 0.6 } as const;

export function decideAction(confidence: number): MatchAction {
  if (confidence >= CONFIDENCE.accept) return 'accepted';
  if (confidence >= CONFIDENCE.confirm) return 'confirmed';
  return 'escalated_to_jbi';
}
