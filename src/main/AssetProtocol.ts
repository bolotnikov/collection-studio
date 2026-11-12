import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { protocol, net } from 'electron';

export class AssetProtocol {
  constructor(
    private readonly runs: string,
    private readonly references: string,
  ) {}
  register(): void {
    protocol.handle('studio-asset', async (request) => {
      const url = new URL(request.url);
      const root =
        url.hostname === 'runs' ? this.runs : url.hostname === 'references' ? this.references : null;
      if (!root) return new Response('Not found', { status: 404 });
      const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
      if (!target.startsWith(path.resolve(root) + path.sep) || path.extname(target) !== '.png')
        return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(target).toString());
    });
  }
}
