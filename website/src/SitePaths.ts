/** Resolve public assets and navigation within the configured deployment path. */
export class SitePaths {
  static public(path: string): string {
    return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
}
