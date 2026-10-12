import { useRef, useState } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { BoardFilter, BoardItemKind } from '../../model/board.ts';
import { BOARD_ITEM_KINDS } from '../../model/board.ts';
import { Popover } from '../../ui/components/Popover.tsx';

type MenuFilter = Pick<BoardFilter, 'kinds' | 'attentionOnly'>;

interface BoardFilterMenuProps {
  readonly filter: MenuFilter;
  readonly onChange: (filter: MenuFilter) => void;
}

function toggle<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function BoardFilterMenu({ filter, onChange }: BoardFilterMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const activeCount = filter.kinds.length + (filter.attentionOnly ? 1 : 0);
  return (
    <span className="board-filter">
      <button
        ref={anchor}
        type="button"
        className={`board-filter__trigger${activeCount > 0 ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <ListFilter size={14} aria-hidden="true" />
        <span>{t('board.filter.menu')}</span>
        {activeCount > 0 ? <span className="board-filter__count num">{activeCount}</span> : null}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label={t('board.filter.label')} width={260}>
        <div className="board-filter__panel">
          <fieldset className="board-filter__group">
            <legend className="small-caps">{t('board.filter.kind')}</legend>
            {BOARD_ITEM_KINDS.map((kind: BoardItemKind) => (
              <label key={kind} className="board-filter__option">
                <input type="checkbox" checked={filter.kinds.includes(kind)} onChange={() => onChange({ kinds: toggle(filter.kinds, kind), attentionOnly: filter.attentionOnly })} />
                {t(`board.filter.kinds.${kind}`)}
              </label>
            ))}
          </fieldset>
          <label className="board-filter__option">
            <input type="checkbox" checked={filter.attentionOnly} onChange={() => onChange({ kinds: filter.kinds, attentionOnly: !filter.attentionOnly })} />
            {t('board.filter.attentionOnly')}
          </label>
          {activeCount > 0 ? (
            <button type="button" className="board-filter__reset link" onClick={() => onChange({ kinds: [], attentionOnly: false })}>
              {t('board.filter.reset')}
            </button>
          ) : null}
        </div>
      </Popover>
    </span>
  );
}
