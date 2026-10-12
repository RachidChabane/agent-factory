import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { NEW_REQUEST_QUERY_PARAMETER, QUERY_FLAG } from '../../model/routes.ts';

interface NewRequestDialogState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/** Whether the new request dialog is open. An address that asks for it opens it once and drops the request from the address. */
export function useNewRequestDialog(): NewRequestDialogState {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const requested = searchParams.get(NEW_REQUEST_QUERY_PARAMETER) === QUERY_FLAG;
  useEffect(() => {
    if (!requested) return;
    setOpen(true);
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete(NEW_REQUEST_QUERY_PARAMETER);
        return params;
      },
      { replace: true },
    );
  }, [requested, setSearchParams]);
  return { open, setOpen };
}
