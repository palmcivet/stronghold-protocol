import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.atlas': 'text/plain',
  '.css': 'text/css',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.skel': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function localResourcePath(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath);
  const absolute = normalize(join(root, decoded));
  return absolute === root || absolute.startsWith(`${root}/`) ? absolute : null;
}

export function devResourcesPlugin({
  productRoot,
  mediaRoot,
  fontRoot,
}: {
  productRoot: string;
  mediaRoot: string;
  fontRoot: string;
}) {
  return {
    name: 'development-resources',
    configureServer(server: { middlewares: { use: (handler: unknown) => void } }) {
      server.middlewares.use(async (request: any, response: any, next: () => void) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return next();
        }
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        let file: string | null = null;
        if (pathname.startsWith('/assets/')) {
          file = localResourcePath(mediaRoot, pathname.slice('/assets/'.length));
        } else if (pathname.startsWith('/fonts/')) {
          file = localResourcePath(fontRoot, pathname.slice('/fonts/'.length));
        } else {
          const match = /^\/data\/seasons\/([^/]+)\/(.+)$/.exec(pathname);
          if (match?.[1] && match[2]) {
            file = localResourcePath(join(productRoot, 'season', match[1]), match[2]);
          }
        }
        if (!file) {
          return next();
        }
        try {
          const info = await stat(file);
          if (!info.isFile()) {
            return next();
          }
          response.statusCode = 200;
          response.setHeader(
            'Content-Type',
            CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream'
          );
          response.setHeader('Content-Length', info.size);
          if (request.method === 'HEAD') {
            return response.end();
          }
          response.end(await readFile(file));
        } catch {
          next();
        }
      });
    },
  };
}
