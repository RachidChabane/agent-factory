const RAYS: readonly (readonly [number, number])[] = [
  [0, 7],
  [32, 5.4],
  [61, 6.6],
  [95, 5.2],
  [128, 6.8],
  [157, 5.6],
  [190, 7],
  [222, 5.2],
  [250, 6.4],
  [283, 5.6],
  [313, 6.9],
  [342, 5.3],
];
const CENTER = 8;
const INNER_RADIUS = 1.1;
const DEGREES_TO_RADIANS = Math.PI / 180;

function ray(angle: number, length: number): string {
  const radians = angle * DEGREES_TO_RADIANS;
  const x1 = CENTER + Math.cos(radians) * INNER_RADIUS;
  const y1 = CENTER + Math.sin(radians) * INNER_RADIUS;
  const x2 = CENTER + Math.cos(radians) * length;
  const y2 = CENTER + Math.sin(radians) * length;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const GLYPH_PATH = RAYS.map(([angle, length]) => ray(angle, length)).join(' ');

interface AgentGlyphProps {
  readonly size?: number | undefined;
  readonly label?: string | undefined;
}

export function AgentGlyph({ size = 16, label }: AgentGlyphProps) {
  return (
    <svg
      className="ds-agent-glyph"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={label === undefined ? undefined : 'img'}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
    >
      <path d={GLYPH_PATH} />
    </svg>
  );
}
