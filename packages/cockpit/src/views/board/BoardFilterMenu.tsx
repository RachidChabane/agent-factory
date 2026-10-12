import { useRef, useState } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';
import type { AgentRole } from '@agent-factory/domain';
import { AGENT_ROLES } from '@agent-factory/domain';
import { ROLE_LABELS } from '../../i18n/labels.ts';
import type { BoardFilter, BoardItemKind } from '../../model/board.ts';
import { BOARD_ITEM_KIND_LABELS, BOARD_ITEM_KINDS } from '../../model/board.ts';
import { Popover } from '../../ui/components/Popover.tsx';

interface BoardFilterMenuProps {
  readonly filter: BoardFilter;
  readonly onChange: (filter: BoardFilter) => void;
}

function toggle<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function BoardFilterMenu({ filter, onChange }: BoardFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const activeCount = filter.kinds.length + filter.roles.length;
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
        <span>Filtre</span>
        {activeCount > 0 ? <span className="board-filter__count num">{activeCount}</span> : null}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label="Filtrer le tableau" width={260}>
        <div className="board-filter__panel">
          <fieldset className="board-filter__group">
            <legend className="small-caps">Type</legend>
            {BOARD_ITEM_KINDS.map((kind: BoardItemKind) => (
              <label key={kind} className="board-filter__option">
                <input type="checkbox" checked={filter.kinds.includes(kind)} onChange={() => onChange({ ...filter, kinds: toggle(filter.kinds, kind) })} />
                {BOARD_ITEM_KIND_LABELS[kind]}
              </label>
            ))}
          </fieldset>
          <fieldset className="board-filter__group">
            <legend className="small-caps">Rôle de l’agent</legend>
            {AGENT_ROLES.map((role: AgentRole) => (
              <label key={role} className="board-filter__option">
                <input type="checkbox" checked={filter.roles.includes(role)} onChange={() => onChange({ ...filter, roles: toggle(filter.roles, role) })} />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </fieldset>
          {activeCount > 0 ? (
            <button type="button" className="board-filter__reset link" onClick={() => onChange({ ...filter, kinds: [], roles: [] })}>
              Réinitialiser les filtres
            </button>
          ) : null}
        </div>
      </Popover>
    </span>
  );
}
