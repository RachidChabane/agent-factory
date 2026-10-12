import type { ReactNode } from 'react';
import { useId } from 'react';

interface EnvironmentPanelProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** A titled part of an environment card, named for assistive technology by its title. */
export function EnvironmentPanel({ title, children }: EnvironmentPanelProps) {
  const headingId = useId();
  return (
    <div className="env-panel" role="group" aria-labelledby={headingId}>
      <h4 id={headingId} className="small-caps">
        {title}
      </h4>
      {children}
    </div>
  );
}
