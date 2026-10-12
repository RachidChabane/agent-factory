import type { NotificationChannelView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';

function ChannelItem({ channel }: { readonly channel: NotificationChannelView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <li className="channel">
      <span className="channel__name">{vocabulary.notificationChannel(channel.kind)}</span>
      <Badge tone={channel.configured ? 'success' : 'idle'}>{channel.configured ? t('settings.notifications.configured') : t('settings.notifications.notConfigured')}</Badge>
      {channel.configured ? null : <span className="channel__note">{t('settings.notifications.secretMissing')}</span>}
    </li>
  );
}

/** The channels the factory can notify through, and whether the secret each one needs is set. */
export function NotificationChannels({ channels }: { readonly channels: readonly NotificationChannelView[] }) {
  const { t } = useI18n();
  if (channels.length === 0) return <EmptyState compact title={t('settings.notifications.empty')} />;
  return (
    <Card padded={false}>
      <ul className="channel-list" aria-label={t('settings.notifications.title')}>
        {channels.map((channel) => (
          <ChannelItem key={channel.kind} channel={channel} />
        ))}
      </ul>
    </Card>
  );
}
