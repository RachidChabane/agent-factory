import type { ReactNode } from 'react';

const INITIALS_LENGTH = 2;

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 0);
  const letters = words.length >= INITIALS_LENGTH ? words.slice(0, INITIALS_LENGTH).map((word) => word[0]) : [...(words[0] ?? '').slice(0, INITIALS_LENGTH)];
  return letters.join('').toUpperCase();
}

interface AvatarProps {
  readonly name?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly size?: 'sm' | 'md' | undefined;
  readonly tone?: 'neutral' | 'accent' | undefined;
}

export function Avatar({ name, icon, size = 'sm', tone = 'neutral' }: AvatarProps) {
  return (
    <span className={`ds-avatar ds-avatar--${size} ds-avatar--${tone}`} title={name} aria-hidden={name === undefined ? true : undefined}>
      {icon ?? (name === undefined ? null : initials(name))}
    </span>
  );
}
