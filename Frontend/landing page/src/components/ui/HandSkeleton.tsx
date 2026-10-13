/**
 * Ilustrasi 21 landmark tangan ala MediaPipe Hands (telapak terbuka).
 * Dipakai sebagai visual "kamera membaca tangan", bukan data asli.
 */
const LM: ReadonlyArray<readonly [number, number]> = [
  [100, 222], // 0 pergelangan
  [68, 202], [46, 178], [33, 152], [24, 128], // ibu jari
  [74, 130], [69, 95], [66, 72], [64, 48], // telunjuk
  [100, 124], [100, 84], [100, 58], [100, 32], // tengah
  [124, 130], [128, 93], [130, 70], [132, 50], // manis
  [144, 142], [153, 114], [158, 96], [162, 78], // kelingking
];

const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const TIPS = new Set([4, 8, 12, 16, 20]);

type Props = {
  className?: string;
  mirrored?: boolean;
  /** Warna tulang & titik mengikuti currentColor. */
  dotClassName?: string;
};

export function HandSkeleton({ className = '', mirrored = false, dotClassName = 'fill-white' }: Props) {
  return (
    <svg
      viewBox="0 0 190 240"
      className={className}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" opacity={0.95}>
        {BONES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={LM[a][0]} y1={LM[a][1]} x2={LM[b][0]} y2={LM[b][1]} />
        ))}
      </g>
      <g stroke="currentColor" strokeWidth={2.4}>
        {LM.map(([x, y], i) => (
          <circle key={i} className={`js-dot ${dotClassName}`} cx={x} cy={y} r={TIPS.has(i) ? 6.5 : 5} />
        ))}
      </g>
    </svg>
  );
}
