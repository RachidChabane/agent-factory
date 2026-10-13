import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useNow } from '../../app/context.tsx';
import { safeLocalStorage } from '../../platform/storage.ts';
import { defaultSince, parseInstant, persistSeenAt, readSeenAt, SINCE_QUERY_PARAMETER } from './changes-since.ts';

export interface ChangesSince {
  /** The instant the changes are counted from. */
  readonly since: number;
  /** When the operator last said, in this browser, that they had seen the changes. */
  readonly seenAt: number | null;
  readonly setSince: (epoch: number) => void;
  /** Remembers that the changes were seen now; false when the browser would not keep it. */
  readonly markSeen: () => boolean;
}

/** The reference of the changes page: the address names it, else the last time the changes were seen in this browser, else a day ago. */
export function useChangesSince(): ChangesSince {
  const now = useNow();
  const [parameters, setParameters] = useSearchParams();
  const [seenAt, setSeenAt] = useState(() => readSeenAt(safeLocalStorage()));
  const [fallback] = useState(() => defaultSince(seenAt, now));
  const requested = parseInstant(parameters.get(SINCE_QUERY_PARAMETER));
  const since = requested ?? fallback;

  const setSince = useCallback(
    (epoch: number) =>
      setParameters(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(SINCE_QUERY_PARAMETER, new Date(epoch).toISOString());
          return next;
        },
        { replace: true },
      ),
    [setParameters],
  );

  useEffect(() => {
    if (requested === null) setSince(fallback);
  }, [requested, fallback, setSince]);

  const markSeen = useCallback(() => {
    const stored = persistSeenAt(safeLocalStorage(), now);
    if (stored) setSeenAt(now);
    return stored;
  }, [now]);

  return { since, seenAt, setSince, markSeen };
}
