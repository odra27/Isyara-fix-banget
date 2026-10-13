/**
 * Ilustrasi 21 landmark tangan ala MediaPipe (telapak terbuka). Sama dengan landing page.
 * Warna tulang mengikuti currentColor.
 */
const LM: ReadonlyArray<readonly [number, number]> = [
  [100, 222],
  [68, 202], [46, 178], [33, 152], [24, 128],
  [74, 130], [69, 95], [66, 72], [64, 48],
  [100, 124], [100, 84], [100, 58], [100, 32],
  [124, 130], [128, 93], [130, 70], [132, 50],
  [144, 142], [153, 114], [158, 96], [162, 78],
];

const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const TIPS = new Set([4, 8, 12, 16, 20]);

export function HandSkeleton({ className, mirrored = false, dotClassName = 'fill-white' }: { className?: string; mirrored?: boolean; dotClassName?: string }) {
  return (
    <svg viewBox="0 0 190 240" className={className} style={mirrored ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <g stroke="currentColor" strokeWidth={4} strokeLinecap="round">
        {BONES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={LM[a][0]} y1={LM[a][1]} x2={LM[b][0]} y2={LM[b][1]} />
        ))}
      </g>
      <g stroke="currentColor" strokeWidth={3}>
        {LM.map(([x, y], i) => (
          <circle key={i} className={dotClassName} cx={x} cy={y} r={TIPS.has(i) ? 7 : 5.5} />
        ))}
      </g>
    </svg>
  );
}
