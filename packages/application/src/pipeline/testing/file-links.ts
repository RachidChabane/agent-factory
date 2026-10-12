import type { ForgeFileLinks } from '../pipeline-settings.ts';

const PATH_SEPARATOR = '/';

/** File links shaped as a GitHub repository's, for tests that read rendered bodies. */
export function webForgeFileLinks(origin: string, owner: string, name: string): ForgeFileLinks {
  const file = (sha: string, path: string): string => `${origin}/${owner}/${name}/blob/${sha}/${path.split(PATH_SEPARATOR).map(encodeURIComponent).join(PATH_SEPARATOR)}`;
  return { file, rawFile: (sha, path) => `${file(sha, path)}?raw=true` };
}
