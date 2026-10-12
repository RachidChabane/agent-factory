import { splitCodeFences } from './assistant-text.ts';

/** What the agent wrote: its prose as paragraphs and its fenced code as blocks. */
export function AssistantText({ text }: { readonly text: string }) {
  return (
    <div className="log-text">
      {splitCodeFences(text).map((segment, position) =>
        segment.kind === 'code' ? (
          <pre key={position} className="log-text__code">
            {segment.text}
          </pre>
        ) : (
          <p key={position} className="log-text__prose">
            {segment.text}
          </p>
        ),
      )}
    </div>
  );
}
