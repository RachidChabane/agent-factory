import { Fragment } from 'react';
import { useI18n } from '../i18n/I18nProvider.tsx';

interface CodeListProps {
  readonly items: readonly string[];
}

/** A written list whose items are identifiers: the items in code type, joined the way the language joins a list. */
export function CodeList({ items }: CodeListProps) {
  const { fmt } = useI18n();
  return (
    <>
      {fmt.listParts(items).map((part, position) =>
        part.kind === 'item' ? (
          <code key={position} className="mono">
            {part.text}
          </code>
        ) : (
          <Fragment key={position}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
