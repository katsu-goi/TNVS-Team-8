import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ocrAssetPaths, screenIdentityDocument, type OcrRuntime } from './visitorOcr';

const accepted = [
  'Philippine Passport', "Philippine Driver's License", 'PRC Professional Identification Card',
  'Company-Issued Employee ID', 'Postal ID',
];

function runtimeFor(results: Array<{ text: string; confidence: number }>): {
  runtime: OcrRuntime;
  recognize: ReturnType<typeof vi.fn>;
} {
  const recognize = vi.fn();
  results.forEach((data) => recognize.mockResolvedValueOnce({ data }));
  return {
    recognize,
    runtime: {
      prepareImage: vi.fn().mockResolvedValue({ variants: ['original', 'enhanced'] }),
      getWorker: vi.fn().mockResolvedValue({
        recognize,
        setParameters: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
}

describe('visitor OCR recovery', () => {
  it('uses only same-origin worker, core, and language asset paths', () => {
    expect(Object.values(ocrAssetPaths)).toEqual([
      '/tesseract/worker.min.js', '/tesseract-core', '/tessdata',
    ]);
    expect(Object.values(ocrAssetPaths).join(' ')).not.toMatch(/https?:|jsdelivr/i);
  });

  it('copies every runtime asset and allows only the required same-origin worker and WASM execution', () => {
    const root = resolve(process.cwd(), '..');
    const preparation = readFileSync(resolve(root, 'frontend/scripts/prepare-tessdata.mjs'), 'utf8');
    const deployment = readFileSync(resolve(root, 'vercel.json'), 'utf8');
    expect(preparation).toContain("'tesseract.js', 'dist', 'worker.min.js'");
    expect(preparation).toContain('tesseract-core-lstm.wasm.js');
    expect(preparation).toContain('tesseract-core-simd-lstm.wasm.js');
    expect(preparation).toContain('tesseract-core-relaxedsimd-lstm.wasm.js');
    expect(deployment).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(deployment).toContain("worker-src 'self'");
  });

  it('retries one safely prepared variant after readable but inconclusive OCR', async () => {
    const { runtime, recognize } = runtimeFor([
      { text: 'REPUBLIC PHILIPPINES CARD', confidence: 58 },
      { text: 'REPUBLIC OF THE PHILIPPINES PASSPORT SURNAME CRUZ GIVEN NAMES ANA', confidence: 76 },
    ]);
    const result = await screenIdentityDocument('image', 'Philippine Passport', accepted, undefined, runtime);
    expect(result.classification).toBe('SUPPORTED_ID_TYPE');
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(recognize).toHaveBeenNthCalledWith(1, 'original', { rotateAuto: true });
    expect(recognize).toHaveBeenNthCalledWith(2, 'enhanced', { rotateAuto: true });
  });

  it('stops immediately and returns no sensitive fields when a payment card is detected', async () => {
    const { runtime, recognize } = runtimeFor([
      { text: 'VISA DEBIT 4111 1111 1111 1111 VALID THRU 12/30 CARDHOLDER', confidence: 91 },
      { text: 'must not run', confidence: 99 },
    ]);
    const result = await screenIdentityDocument('card', 'Company-Issued Employee ID', accepted, undefined, runtime);
    expect(result.classification).toBe('PAYMENT_CARD_DETECTED');
    expect(result.extracted.idNumberLast4).toBe('');
    expect(result.extracted.expirationDate).toBe('');
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it('reports image quality separately from a successful but unreadable OCR attempt', async () => {
    const { runtime } = runtimeFor([
      { text: 'A B', confidence: 8 },
      { text: 'C D', confidence: 10 },
    ]);
    runtime.prepareImage = vi.fn().mockResolvedValue({
      variants: ['enhanced', 'original'],
      recoveryIssue: { reason: 'IMAGE_BLURRY', message: 'The image is blurry. Hold your ID steady and retake it.' },
    });
    const result = await screenIdentityDocument('blurred', 'Postal ID', accepted, undefined, runtime);
    expect(result.ocrStatus).toBe('SUCCEEDED');
    expect(result.reason).toBe('IMAGE_BLURRY');
    expect(result.warnings[0]).toMatch(/blurry/i);
  });

  it('merges missing fields from a later OCR region without replacing classified evidence', async () => {
    const { runtime, recognize } = runtimeFor([
      { text: 'PHLPOST\nPOSTAL IDENTITY CARD\nADDRESS MANILA\nPOSTAL REFERENCE NO 12345678', confidence: 82 },
      { text: 'NAME\nANA SANTOS', confidence: 70 },
    ]);
    const result = await screenIdentityDocument('postal-image', 'Postal ID', accepted, undefined, runtime);
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(result.classification).toBe('SUPPORTED_ID_TYPE');
    expect(result.detectedIdType).toBe('Postal ID');
    expect(result.extracted.fullName).toBe('ANA SANTOS');
    expect(result.extracted.idNumberLast4).toBe('5678');
    expect(result.extracted.issuingAuthority).toBe('PHLPost');
  });

  it.each([
    new Error('worker initialization failed'),
    new Error('404 while loading eng.traineddata.gz'),
  ])('returns a safe engine-unavailable state for worker or traineddata failures', async (failure) => {
    const runtime: OcrRuntime = {
      prepareImage: vi.fn().mockResolvedValue({ variants: ['image'] }),
      getWorker: vi.fn().mockRejectedValue(failure),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await screenIdentityDocument('image', 'Postal ID', accepted, undefined, runtime);
    expect(result.ocrStatus).toBe('FAILED');
    expect(result.reason).toBe('ENGINE_UNAVAILABLE');
    expect(result.warnings[0]).toMatch(/temporarily unavailable/i);
    expect(result.warnings.join(' ')).not.toContain(failure.message);
    consoleError.mockRestore();
  });
});
