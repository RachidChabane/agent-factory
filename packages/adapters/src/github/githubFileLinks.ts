import type { ForgeFileLinks, RepositoryCoordinates } from '@agent-factory/application';
import { GITHUB_WEB_ORIGIN } from './constants.ts';

const PATH_SEPARATOR = '/';
const RAW_QUERY = '?raw=true';

/** The web page of a GitHub repository. */
export function gitHubRepositoryUrl(repository: RepositoryCoordinates): string {
  return `${GITHUB_WEB_ORIGIN}/${repository.owner}/${repository.name}`;
}

/** Links to the files of a GitHub repository's commits, as its web pages show them. */
export class GitHubFileLinks implements ForgeFileLinks {
  private readonly repository: RepositoryCoordinates;

  constructor(repository: RepositoryCoordinates) {
    this.repository = repository;
  }

  file(sha: string, path: string): string {
    return `${gitHubRepositoryUrl(this.repository)}/blob/${sha}/${path.split(PATH_SEPARATOR).map(encodeURIComponent).join(PATH_SEPARATOR)}`;
  }

  rawFile(sha: string, path: string): string {
    return `${this.file(sha, path)}${RAW_QUERY}`;
  }
}
