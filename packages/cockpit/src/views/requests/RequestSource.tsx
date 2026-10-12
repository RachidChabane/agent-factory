import { FileText, Paperclip } from 'lucide-react';
import type { Attachment, RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';

const IMAGE_MEDIA_PREFIX = 'image/';

function isImage(attachment: Pick<Attachment, 'mediaType'>): boolean {
  return attachment.mediaType.startsWith(IMAGE_MEDIA_PREFIX);
}

/** An attachment is served by the factory or by a local forge, so it opens as an ordinary link in a new tab. */
function AttachmentItem({ attachment }: { readonly attachment: Attachment }) {
  const { t } = useI18n();
  return (
    <li className={isImage(attachment) ? 'request-attachment request-attachment--image' : 'request-attachment'}>
      <a href={attachment.url} target="_blank" rel="noreferrer" title={t('requests.attachment.open', { name: attachment.name })}>
        {isImage(attachment) ? <img src={attachment.url} alt={attachment.name} loading="lazy" /> : <Paperclip size={13} aria-hidden="true" />}
        <span className="truncate">{attachment.name}</span>
      </a>
    </li>
  );
}

export function RequestSource({ request }: { readonly request: RequestView }) {
  const { t } = useI18n();
  return (
    <Section title={t('requests.source.title')} id="request-source">
      {request.body.trim().length === 0 ? <EmptyState compact icon={<FileText size={16} />} title={t('requests.source.empty')} /> : <blockquote className="request-body">{request.body}</blockquote>}
      {request.attachments.length === 0 ? (
        <p className="subtle">{t('requests.attachments.none')}</p>
      ) : (
        <ul className="request-attachments" aria-label={t('requests.attachments.list')}>
          {request.attachments.map((attachment) => (
            <AttachmentItem key={`${attachment.name}-${attachment.url}`} attachment={attachment} />
          ))}
        </ul>
      )}
    </Section>
  );
}
