import { useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

export const DIFF_LINE_KINDS = ['hunk', 'add', 'del', 'context'] as const;
export type DiffLineKind = (typeof DIFF_LINE_KINDS)[number];

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
  readonly text: string;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const OLD_START_GROUP = 1;
const NEW_START_GROUP = 2;

export function parseUnifiedPatch(patch: string): readonly DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split('\n')) {
    const hunk = HUNK_HEADER.exec(raw);
    if (hunk !== null) {
      oldLine = Number(hunk[OLD_START_GROUP]);
      newLine = Number(hunk[NEW_START_GROUP]);
      lines.push({ kind: 'hunk', oldNumber: null, newNumber: null, text: raw });
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'add', oldNumber: null, newNumber: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', oldNumber: oldLine, newNumber: null, text: raw.slice(1) });
      oldLine += 1;
    } else if (raw.length > 0 || lines.length > 0) {
      lines.push({ kind: 'context', oldNumber: oldLine, newNumber: newLine, text: raw.startsWith(' ') ? raw.slice(1) : raw });
      oldLine += 1;
      newLine += 1;
    }
  }
  return lines;
}

const DIFF_PREFIX: Readonly<Record<DiffLineKind, string>> = { hunk: '', add: '+', del: '−', context: ' ' };

interface DiffViewerProps {
  readonly path: string;
  readonly patch: string;
  readonly additions: number;
  readonly deletions: number;
}

export function DiffViewer({ path, patch, additions, deletions }: DiffViewerProps) {
  const { t } = useI18n();
  const lines = useMemo(() => parseUnifiedPatch(patch), [patch]);
  return (
    <figure className="ds-diff">
      <figcaption className="ds-diff__header">
        <span className="ds-diff__path mono truncate">{path}</span>
        <span className="ds-diff__stats num">
          <span className="ds-diff__add">+{additions}</span>
          <span className="ds-diff__del">−{deletions}</span>
        </span>
      </figcaption>
      <div className="ds-diff__scroll" tabIndex={0} aria-label={t('diff.label', { path })}>
        <table className="ds-diff__table">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className={`ds-diff__line ds-diff__line--${line.kind}`}>
                <td className="ds-diff__number num">{line.oldNumber ?? ''}</td>
                <td className="ds-diff__number num">{line.newNumber ?? ''}</td>
                <td className="ds-diff__text">
                  <span className="ds-diff__prefix" aria-hidden="true">
                    {DIFF_PREFIX[line.kind]}
                  </span>
                  {line.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
