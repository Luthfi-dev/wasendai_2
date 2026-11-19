import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const req = createRequire(import.meta.url);

// Clamp Rust/Rayon/Tokio/Go thread pools so shared/cPanel hosting (CloudLinux NPROC limits)
// never panics with "Os { code: 11, kind: WouldBlock, message: Resource temporarily unavailable }".
const buildEnv = {
  ...process.env,
  RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS || '1',
  TOKIO_WORKER_THREADS: process.env.TOKIO_WORKER_THREADS || '1',
  UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '2',
  GOMAXPROCS: process.env.GOMAXPROCS || '1',
  OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '1',
  ROLLDOWN_THREADS: process.env.ROLLDOWN_THREADS || '1'
};

function runNodeScript(scriptPath, args) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    env: buildEnv,
    stdio: 'inherit'
  });
  if (res.error) {
    console.error(`[build] Failed to run ${scriptPath}:`, res.error.message);
    process.exit(1);
  }
  if (typeof res.status === 'number' && res.status !== 0) {
    process.exit(res.status);
  }
  if (res.signal) {
    console.error(`[build] Process ${scriptPath} killed by signal ${res.signal}`);
    process.exit(1);
  }
}

async function bundleServer() {
  const entryAbs = path.join(rootDir, 'server.ts');
  const outFile = path.join(rootDir, 'dist', 'server.js');

  let esbuildPath = null;
  if (process.env.FORCE_ROLLDOWN_SERVER_BUILD !== '1') {
    try {
      esbuildPath = req.resolve('esbuild');
    } catch {
      esbuildPath = null;
    }
  }

  if (esbuildPath) {
    try {
      const esbuildMod = await import(pathToFileURL(esbuildPath).href);
      const esbuild = esbuildMod.default ?? esbuildMod;
      await esbuild.build({
        entryPoints: [entryAbs],
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        sourcemap: true,
        outfile: outFile
      });
      console.log('[build] Bundled server.ts -> dist/server.js (esbuild)');
      return;
    } catch (err) {
      console.warn(
        '[build] esbuild server bundle unavailable/failed, falling back to rolldown:',
        err?.message || err
      );
    }
  }

  const vitePkgPath = req.resolve('vite/package.json');
  const viteRequire = createRequire(vitePkgPath);
  const rolldownPath = viteRequire.resolve('rolldown');
  const rolldownMod = await import(pathToFileURL(rolldownPath).href);
  const rolldown = rolldownMod.rolldown ?? rolldownMod.default?.rolldown;

  if (typeof rolldown !== 'function') {
    throw new Error('Rolldown bundler not found inside vite dependencies.');
  }

  const bundle = await rolldown({
    input: entryAbs,
    platform: 'node',
    external: (id) => {
      if (!id || id === entryAbs || id === 'server.ts') return false;
      if (
        id.startsWith('\0') ||
        id.startsWith('./') ||
        id.startsWith('../') ||
        id.startsWith('@/')
      ) {
        return false;
      }
      if (path.isAbsolute(id) || /^[a-zA-Z]:[\\/]/.test(id)) return false;
      return true;
    },
    onwarn(warning, warn) {
      if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return;
      warn(warning);
    }
  });

  try {
    await bundle.write({
      file: outFile,
      format: 'esm',
      sourcemap: true
    });
  } finally {
    await bundle.close();
  }

  console.log('[build] Bundled server.ts -> dist/server.js (rolldown)');
}

if (process.argv.includes('--bundle-server')) {
  bundleServer().catch((err) => {
    console.error('[build] Failed to bundle server.ts:', err);
    process.exit(1);
  });
} else {
  const vitePkgPath = req.resolve('vite/package.json');
  const viteCliPath = path.join(path.dirname(vitePkgPath), 'bin', 'vite.js');
  runNodeScript(viteCliPath, ['build', '--configLoader', 'runner']);
  runNodeScript(__filename, ['--bundle-server']);
}
