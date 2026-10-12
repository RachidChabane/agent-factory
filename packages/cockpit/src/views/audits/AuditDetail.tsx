import { useState } from 'react';
import type { AuditView } from '../../contract/index.ts';
import { AuditConclusion } from './AuditConclusion.tsx';
import { AuditDraft } from './AuditDraft.tsx';
import { AuditFiles } from './AuditFiles.tsx';
import { AuditHeader } from './AuditHeader.tsx';
import { AuditNotices } from './AuditNotices.tsx';
import { ResolveDialog } from './ResolveDialog.tsx';

export function AuditDetail({ audit }: { readonly audit: AuditView }) {
  const [resolving, setResolving] = useState(false);
  return (
    <article className="detail audit-detail">
      <AuditHeader audit={audit} onResolve={() => setResolving(true)} />
      <AuditNotices audit={audit} />
      <AuditConclusion audit={audit} />
      <div className="audit-detail__grid">
        <AuditFiles audit={audit} />
        <AuditDraft audit={audit} />
      </div>
      {resolving ? <ResolveDialog audit={audit} onClose={() => setResolving(false)} /> : null}
    </article>
  );
}
