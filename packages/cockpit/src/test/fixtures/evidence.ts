const WIDTH = 960;
const HEIGHT = 600;

const PALETTE = {
  page: '#f3f4f8',
  surface: '#ffffff',
  border: '#dfe2ea',
  text: '#1b1f2a',
  muted: '#5f6676',
  subtle: '#9097a8',
  brand: '#3347d6',
  brandSoft: '#e8ebfc',
  savingsBg: '#e6f5ec',
  savingsText: '#14733d',
} as const;

interface Row {
  readonly title: string;
  readonly status: string;
  readonly when: string;
  readonly savings: string;
}

const ROWS: readonly Row[] = [
  { title: 'SF-48213 · Cordless drill kit', status: 'In transit', when: 'Today', savings: '$4.20' },
  { title: 'SF-48177 · Bathroom paint 10 L', status: 'Delivered', when: 'Yesterday', savings: '$12.00' },
  { title: 'SF-48102 · Garden hose set', status: 'Delivered', when: '2 days ago', savings: '$3.50' },
  { title: 'SF-48068 · Folding ladder', status: 'Delivered', when: '3 days ago', savings: '$18.90' },
  { title: 'SF-47954 · LED panel light × 4', status: 'Returned', when: 'Last week', savings: '$6.40' },
  { title: 'SF-47890 · Workbench vice', status: 'Delivered', when: 'Last week', savings: '$2.75' },
];

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function text(x: number, y: number, content: string, size: number, fill: string, weight = 400, anchor = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

function chrome(title: string): string {
  return [
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${PALETTE.page}"/>`,
    `<rect width="${WIDTH}" height="56" fill="${PALETTE.surface}"/>`,
    `<rect y="56" width="${WIDTH}" height="1" fill="${PALETTE.border}"/>`,
    `<rect x="24" y="16" width="24" height="24" rx="6" fill="${PALETTE.brand}"/>`,
    text(60, 34, 'Storefront', 15, PALETTE.text, 650),
    text(WIDTH - 24, 34, 'Customer account', 12, PALETTE.muted, 500, 'end'),
    `<rect x="0" y="57" width="200" height="${HEIGHT - 57}" fill="${PALETTE.surface}"/>`,
    `<rect x="200" y="57" width="1" height="${HEIGHT - 57}" fill="${PALETTE.border}"/>`,
    ...['Overview', 'Order history', 'Wishlists', 'Addresses', 'Settings'].map((item, index) =>
      [
        index === 1 ? `<rect x="12" y="${78 + index * 36}" width="176" height="30" rx="6" fill="${PALETTE.brandSoft}"/>` : '',
        text(28, 98 + index * 36, item, 13, index === 1 ? PALETTE.brand : PALETTE.muted, index === 1 ? 600 : 450),
      ].join(''),
    ),
    text(232, 100, title, 22, PALETTE.text, 650),
    `<rect x="232" y="118" width="300" height="34" rx="8" fill="${PALETTE.surface}" stroke="${PALETTE.border}"/>`,
    text(248, 140, 'Search an order', 12, PALETTE.subtle),
  ].join('');
}

function table(withSavings: boolean): string {
  const left = 232;
  const top = 176;
  const width = WIDTH - left - 32;
  const header = [
    `<rect x="${left}" y="${top}" width="${width}" height="${ROWS.length * 56 + 44}" rx="10" fill="${PALETTE.surface}" stroke="${PALETTE.border}"/>`,
    text(left + 20, top + 27, 'ORDER', 10.5, PALETTE.subtle, 600),
    text(left + 360, top + 27, 'STATUS', 10.5, PALETTE.subtle, 600),
    text(left + (withSavings ? 500 : 560), top + 27, 'DATE', 10.5, PALETTE.subtle, 600),
    withSavings ? text(left + width - 20, top + 27, 'SAVINGS', 10.5, PALETTE.subtle, 600, 'end') : '',
    `<rect x="${left}" y="${top + 43}" width="${width}" height="1" fill="${PALETTE.border}"/>`,
  ].join('');
  const rows = ROWS.map((row, index) => {
    const y = top + 44 + index * 56;
    return [
      index > 0 ? `<rect x="${left + 16}" y="${y}" width="${width - 32}" height="1" fill="${PALETTE.border}"/>` : '',
      text(left + 20, y + 33, row.title, 13.5, PALETTE.text, 550),
      `<rect x="${left + 360}" y="${y + 18}" width="${row.status.length * 7 + 18}" height="22" rx="11" fill="${PALETTE.page}"/>`,
      text(left + 369, y + 33, row.status, 11.5, PALETTE.muted, 500),
      text(left + (withSavings ? 500 : 560), y + 33, row.when, 12.5, PALETTE.muted),
      withSavings
        ? `<rect x="${left + width - 92}" y="${y + 17}" width="72" height="24" rx="12" fill="${PALETTE.savingsBg}"/>` +
          text(left + width - 56, y + 33, row.savings, 12, PALETTE.savingsText, 650, 'middle')
        : '',
    ].join('');
  }).join('');
  return header + rows;
}

function svgDocument(body: string, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}${extra}</svg>`;
}

function dataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const EVIDENCE_IMAGE_WIDTH = WIDTH;
export const EVIDENCE_IMAGE_HEIGHT = HEIGHT;

export function historyBeforeImage(): string {
  return dataUri(svgDocument(chrome('Order history') + table(false)));
}

export function historyAfterImage(): string {
  return dataUri(svgDocument(chrome('Order history') + table(true)));
}

const TOOLTIP_X = 640;
const TOOLTIP_Y = 250;

export function historyRecording(): string {
  const tooltip = [
    `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.4;0.5;0.9;1" dur="4s" repeatCount="indefinite"/>`,
    `<rect x="${TOOLTIP_X}" y="${TOOLTIP_Y}" width="220" height="92" rx="10" fill="${PALETTE.text}"/>`,
    text(TOOLTIP_X + 16, TOOLTIP_Y + 26, 'Savings of the order', 12, '#ffffff', 650),
    text(TOOLTIP_X + 16, TOOLTIP_Y + 50, 'Discount code  $3.00', 11.5, '#d9dce6'),
    text(TOOLTIP_X + 16, TOOLTIP_Y + 70, 'Free shipping  $1.20', 11.5, '#d9dce6'),
    `</g>`,
  ].join('');
  const cursor = [
    `<g><animateTransform attributeName="transform" type="translate" values="420 420; 860 236; 860 236; 420 420" keyTimes="0;0.4;0.9;1" dur="4s" repeatCount="indefinite"/>`,
    `<path d="M0 0 L0 18 L5 13 L9 22 L12 21 L8 12 L15 12 Z" fill="#111" stroke="#fff" stroke-width="1.5"/>`,
    `</g>`,
  ].join('');
  return dataUri(svgDocument(chrome('Order history') + table(true), tooltip + cursor));
}

export function historyRecordingPoster(): string {
  return historyAfterImage();
}

function skillCard(lines: readonly string[], heading: string, tone: string): string {
  return [
    `<rect x="232" y="176" width="${WIDTH - 264}" height="360" rx="10" fill="${PALETTE.surface}" stroke="${PALETTE.border}"/>`,
    text(256, 212, heading, 13, tone, 650),
    ...lines.map((line, index) => text(256, 248 + index * 26, line, 13, PALETTE.text)),
  ].join('');
}

export function briefBeforeImage(): string {
  return dataUri(
    svgDocument(
      chrome('Product brief') +
        skillCard(
          [
            'Product: cordless drill.',
            'Audience: DIY users.',
            'Message: our drills are the best on the market.',
            'Specifications: powerful and light.',
          ],
          'Product brief — base version',
          PALETTE.muted,
        ),
    ),
  );
}

export function briefAfterImage(): string {
  return dataUri(
    svgDocument(
      chrome('Product brief') +
        skillCard(
          [
            'Product: 18 V cordless drill, 2 × 2.0 Ah batteries.',
            'Specifications: 55 Nm torque, 13 mm chuck, 1.5 kg.',
            'Audience: occasional DIY users, 30–45 years old, homeowners.',
            'Message: "The right drill for weekend projects".',
            'Evidence: 4.4/5 over 1,860 reviews.',
          ],
          'Product brief — branch',
          PALETTE.brand,
        ),
    ),
  );
}
