import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const androidWwwDir = path.join(rootDir, 'android-project', 'app', 'src', 'main', 'assets', 'www');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

fs.rmSync(androidWwwDir, { recursive: true, force: true });
fs.mkdirSync(androidWwwDir, { recursive: true });
fs.cpSync(distDir, androidWwwDir, { recursive: true });

console.log(`Synced ${distDir} -> ${androidWwwDir}`);
