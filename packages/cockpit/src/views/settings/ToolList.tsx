import { relativeTime } from '../../format/format.ts';
import { TOOL_STATUS_LABELS } from '../../i18n/labels.ts';
import type { ToolConnection, ToolName } from '../../contract/index.ts';
import { toolMark } from '../../model/status.ts';
import { Button } from '../../ui/components/Button.tsx';
import { InlineCommand } from '../../ui/components/CodeBlock.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';

const NO_VERSION_LABEL = '—';
const UNCHECKED_LABEL = 'Non vérifié';
const UNCHECKED_DETAIL = 'Aucun test enregistré pour cet outil.';

interface ToolListProps {
  readonly tools: readonly ToolConnection[];
  readonly unchecked: readonly ToolName[];
  readonly now: number;
  readonly testing: boolean;
  readonly onTest: (tool: ToolName) => void;
}

function TestButton({ tool, testing, onTest }: { readonly tool: ToolName; readonly testing: boolean; readonly onTest: (tool: ToolName) => void }) {
  return (
    <div className="settings-tool__action">
      <Button size="sm" disabled={testing} aria-label={`Tester ${tool}`} onClick={() => onTest(tool)}>
        Tester
      </Button>
    </div>
  );
}

export function ToolList({ tools, unchecked, now, testing, onTest }: ToolListProps) {
  return (
    <ul className="settings-tools">
      {tools.map((tool) => (
        <li key={tool.tool} className="settings-tool" aria-label={tool.tool}>
          <div className="settings-tool__identity">
            <span className="settings-tool__name mono">{tool.tool}</span>
            <span className="settings-tool__status">
              <StatusMark mark={toolMark(tool.status)} label={TOOL_STATUS_LABELS[tool.status]} />
              {TOOL_STATUS_LABELS[tool.status]}
            </span>
            <span className="settings-tool__version mono">{tool.version ?? NO_VERSION_LABEL}</span>
          </div>
          <div className="settings-tool__body">
            <p className="settings-tool__detail">{tool.detail}</p>
            <p className="settings-tool__checked">
              vérifié il y a <span className="num">{relativeTime(tool.checkedAt, now)}</span>
            </p>
            {tool.fixCommand === null ? null : (
              <div className="settings-tool__fix">
                <span className="settings-tool__fix-label">Pour corriger :</span>
                <InlineCommand command={tool.fixCommand} />
              </div>
            )}
          </div>
          <TestButton tool={tool.tool} testing={testing} onTest={onTest} />
        </li>
      ))}
      {unchecked.map((tool) => (
        <li key={tool} className="settings-tool" aria-label={tool}>
          <div className="settings-tool__identity">
            <span className="settings-tool__name mono">{tool}</span>
            <span className="settings-tool__status">
              <StatusMark mark="idle" label={UNCHECKED_LABEL} />
              {UNCHECKED_LABEL}
            </span>
            <span className="settings-tool__version mono">{NO_VERSION_LABEL}</span>
          </div>
          <div className="settings-tool__body">
            <p className="settings-tool__detail">{UNCHECKED_DETAIL}</p>
          </div>
          <TestButton tool={tool} testing={testing} onTest={onTest} />
        </li>
      ))}
    </ul>
  );
}
