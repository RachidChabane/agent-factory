import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MERGE_QUERY_PARAMETER, QUERY_FLAG } from '../../model/routes.ts';

interface MergeDialogState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/**
 * Whether the merge confirmation is open. An address that asks for it opens it once, and only when
 * merging is on offer; the request is dropped from the address either way, so that it never lingers.
 */
export function useMergeDialog(mergeable: boolean): MergeDialogState {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const requested = searchParams.get(MERGE_QUERY_PARAMETER) === QUERY_FLAG;
  useEffect(() => {
    if (!requested) return;
    if (mergeable) setOpen(true);
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete(MERGE_QUERY_PARAMETER);
        return params;
      },
      { replace: true },
    );
  }, [requested, mergeable, setSearchParams]);
  return { open, setOpen };
}
