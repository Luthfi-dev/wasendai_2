// Entry point standar untuk cPanel Setup Node.js App / Phusion Passenger / DirectAdmin / PM2
// Pastikan sudah menjalankan `npm run build` terlebih dahulu sebelum menjalankan `node server.js`
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'production';
}

try {
  await import('dotenv/config');
} catch {
  // Abaikan secara aman jika dotenv tidak tersedia
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiledServerPath = path.join(__dirname, 'dist', 'server.js');

if (!fs.existsSync(compiledServerPath)) {
  console.error(
    '[Japriin Hosting Startup Error] File hasil build dist/server.js tidak ditemukan.\n' +
      'Jalankan perintah `npm run build` terlebih dahulu sebelum menyalakan aplikasi dengan `server.js`.'
  );
  process.exit(1);
}

if (process.cwd() !== __dirname) {
  try {
    process.chdir(__dirname);
  } catch {
    // Abaikan jika filesystem/environment tidak mengizinkan chdir
  }
}

await import('./dist/server.js');
