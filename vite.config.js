import { defineConfig, loadEnv } from 'vite';

function localAdminApiPlugin() {
  const adminPaths = new Set(['/canesprout-admin-api-v268', '/canesprout-admin-api', '/api/canesprout-admin-v268', '/api/admin-accounts-v2', '/api/admin-accounts']);
  return {
    name: 'canesprout-local-admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = String(req.url || '').split('?')[0];
        if (!adminPaths.has(pathname)) return next();
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          return res.end('');
        }
        if (!['GET', 'POST'].includes(req.method || '')) {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Method not allowed.' }));
        }
        try {
          let raw = '';
          if (req.method === 'POST') for await (const chunk of req) raw += chunk;
          req.body = req.method === 'GET' ? { action: 'status' } : (raw ? JSON.parse(raw) : {});
          const { default: handler } = await import('./api/canesprout-admin-v268.js');
          const reply = {
            status(code) { res.statusCode = code; return reply; },
            setHeader(name, value) { res.setHeader(name, value); return reply; },
            end(value) { res.end(value); return reply; }
          };
          await handler(req, reply);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error?.message || 'Local admin API failed.' }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    base: '/',
    esbuild: { jsx: 'automatic' },
    plugins: [localAdminApiPlugin()],
    build: {
      target: 'es2020',
      sourcemap: false,
      minify: 'esbuild',
      cssMinify: true,
      cssCodeSplit: true,
      reportCompressedSize: false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            appwrite: ['appwrite']
          }
        }
      }
    }
  };
});
