import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(frontendRoot, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz');
const destinationDirectory = resolve(frontendRoot, 'public', 'tessdata');
await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, resolve(destinationDirectory, 'eng.traineddata.gz'));
