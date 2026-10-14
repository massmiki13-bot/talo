import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'

// In sviluppo serve le funzioni di /api come farebbe Vercel in produzione.
function localApi() {
  return {
    name: 'talo-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.startsWith('/api/') ? url.pathname.slice(5).replace(/\/$/, '') : null;
        const file = name && /^[a-z0-9-]+$/.test(name) ? path.resolve(__dirname, 'api', `${name}.js`) : null;
        if (!file || !fs.existsSync(file)) return next();

        let raw = '';
        for await (const chunk of req) raw += chunk;
        req.body = raw;
        req.query = Object.fromEntries(url.searchParams);
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(obj));
          return res;
        };
        try {
          const mod = await server.ssrLoadModule(file);
          await mod.default(req, res);
        } catch (e) {
          console.error(`[api/${name}]`, e);
          if (!res.headersSent) res.status(500).json({ error: e.message });
        }
      });
    },
  };
}

// Service worker con versione ed elenco dei file di questa build: a ogni pubblicazione il telefono
// scarica la nuova versione completa e l'app installata funziona tutta offline.
function precacheServiceWorker() {
  return {
    name: 'talo-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f)).sort();
      const version = `talo-${createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12)}`;
      const source = fs.readFileSync(path.resolve(__dirname, 'src/sw-template.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(files.map((f) => `/${f}`)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// Degli schemi delle entità al browser servono solo i valori predefiniti: il resto (titoli, descrizioni,
// elenchi di valori) non entra nel pacchetto iniziale.
function slimEntitySchemas() {
  return {
    name: 'talo-slim-schemas',
    enforce: 'pre',
    load(id) {
      if (!/schema\/entities\/[^/]+\.jsonc\?raw$/.test(id)) return null;
      try {
        const schema = JSON.parse(fs.readFileSync(id.replace(/\?raw$/, ''), 'utf8'));
        const properties = {};
        for (const [key, prop] of Object.entries(schema.properties || {})) {
          if (prop && typeof prop === 'object' && 'default' in prop) properties[key] = { default: prop.default };
        }
        return `export default ${JSON.stringify(JSON.stringify({ name: schema.name, properties }))}`;
      } catch {
        return null; // schema non leggibile: si usa il file così com'è
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Le funzioni server leggono le variabili (anche quelle segrete) da process.env.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // OneDrive tocca i file in public/ durante la sincronizzazione.
      watch: { ignored: ['**/public/**'] },
    },
    ssr: {
      external: ['nodemailer', '@supabase/supabase-js', 'imapflow', 'mailparser'],
    },
    plugins: [slimEntitySchemas(), react(), localApi(), precacheServiceWorker()],
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
