import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

console.log('');
console.log('CaneSprout Registry development launcher');
console.log(`Project: ${root}`);
console.log(`Node:    ${process.version}`);
console.log('');

let createServer;

try {
  ({ createServer } = await import('vite'));
} catch (error) {
  console.error('Vite could not be loaded from this project.');
  console.error('');
  console.error('Run this once inside the CaneSprout project folder:');
  console.error('  npm.cmd install');
  console.error('');
  console.error(`Technical error: ${error?.message || error}`);
  process.exitCode = 1;
  process.exit();
}

try {
  const server = await createServer({
    root,
    clearScreen: false,
    server: {
      host: 'localhost',
      port: 5174,
      strictPort: true,
    },
  });

  await server.listen();

  console.log('');
  console.log('CaneSprout is running.');
  console.log('Open: http://localhost:5174');
  console.log('');
  console.log('Keep this window open while using CaneSprout.');
  console.log('Press Ctrl+C to stop the server.');
  console.log('');

  server.printUrls();

  const stop = async () => {
    console.log('');
    console.log('Stopping CaneSprout...');
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error('');
  console.error('CaneSprout development server failed to start.');
  console.error(error?.stack || error?.message || error);
  console.error('');

  if (String(error?.code || '') === 'EADDRINUSE') {
    console.error('Port 5174 is already in use.');
    console.error('A previous CaneSprout/Vite server may already be running.');
  }

  process.exitCode = 1;
}
