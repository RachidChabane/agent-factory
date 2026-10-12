export const SUPPORTED_PLATFORMS = ['darwin', 'linux'] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export type PlatformTable<Value> = Readonly<Record<SupportedPlatform, Value>>;

export class UnsupportedPlatformError extends Error {
  readonly platform: string;

  constructor(platform: string) {
    super(`The platform ${JSON.stringify(platform)} is not supported: the factory runs on ${SUPPORTED_PLATFORMS.join(' and ')}`);
    this.name = 'UnsupportedPlatformError';
    this.platform = platform;
  }
}

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return SUPPORTED_PLATFORMS.some((supported) => supported === platform);
}

export function forPlatform<Value>(table: PlatformTable<Value>, platform: string): Value {
  if (!isSupportedPlatform(platform)) throw new UnsupportedPlatformError(platform);
  return table[platform];
}
