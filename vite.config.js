import { defineConfig, loadEnv } from 'vite';

function localAdminApiPlugin() {
  return {
    name: 'canesprout-local-admin-api',
    configureServer(server) {
      server.middlewares.use('/api/admin-accounts', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }
        try {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          req.body = raw ? JSON.parse(raw) : {};
          const { default: handler } = await import('./api/admin-accounts.js');
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
