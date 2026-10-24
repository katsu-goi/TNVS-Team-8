import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(frontendRoot, 'public');
const assets = [
  {
    source: resolve(frontendRoot, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
    destination: resolve(publicRoot, 'tessdata', 'eng.traineddata.gz'),
  },
  {
    source: resolve(frontendRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    destination: resolve(publicRoot, 'tesseract', 'worker.min.js'),
  },
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']
    .map((name) => ({
      source: resolve(frontendRoot, 'node_modules', 'tesseract.js-core', name),
      destination: resolve(publicRoot, 'tesseract-core', name),
    })),
];

await Promise.all(assets.map(async ({ source, destination }) => {
  const sourceStats = await stat(source);
  if (!sourceStats.isFile() || sourceStats.size === 0) throw new Error(`Required OCR asset is missing: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}));
