import {
  classifyIdentityDocument,
  failedDocumentScreening,
  type ExtractedIdField,
  type DocumentScreeningReason,
  type DocumentScreeningResult,
} from './visitorDocumentScreening';
import { analyzeDocumentFrame } from './idDocumentDetection';

type OcrProgress = { status: string; progress: number };
type OcrImage = string | HTMLCanvasElement;
type OcrData = { text: string; confidence: number };
type WorkerLike = {
  recognize(image: OcrImage, options?: { rotateAuto?: boolean }): Promise<{ data: OcrData }>;
  setParameters(parameters: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
};

type ImageQualityIssue = {
  reason: Extract<DocumentScreeningReason,
    'IMAGE_TOO_SMALL' | 'IMAGE_BLURRY' | 'LOW_LIGHT' | 'OVEREXPOSED' | 'CORNERS_NOT_VISIBLE'>;
  message: string;
};

export type PreparedIdentityImage = {
  variants: OcrImage[];
  blockingIssue?: ImageQualityIssue;
  recoveryIssue?: ImageQualityIssue;
};

export type OcrRuntime = {
  prepareImage(image: string, selectedIdType?: string): Promise<PreparedIdentityImage>;
  getWorker(onProgress?: (progress: OcrProgress) => void): Promise<WorkerLike>;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export const ocrAssetPaths = {
  workerPath: `${basePath}/tesseract/worker.min.js`,
  corePath: `${basePath}/tesseract-core`,
  langPath: `${basePath}/tessdata`,
} as const;

const OCR_TIMEOUT_MS = 45_000;
let workerPromise: Promise<WorkerLike> | null = null;
let currentProgressHandler: ((progress: OcrProgress) => void) | undefined;
let lastKey = '';
let lastResult: DocumentScreeningResult | null = null;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    operation.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

async function resetWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try { await (await pending).terminate(); } catch { /* the failed worker has nothing reusable */ }
}

async function worker(onProgress?: (progress: OcrProgress) => void): Promise<WorkerLike> {
  currentProgressHandler = onProgress;
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async ({ createWorker, PSM }) => {
      const created = await createWorker('eng', undefined, {
        ...ocrAssetPaths,
        workerBlobURL: false,
        logger: (message) => currentProgressHandler?.({ status: message.status, progress: message.progress }),
      });
      await created.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      return created as WorkerLike;
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return withTimeout(workerPromise, OCR_TIMEOUT_MS, 'OCR worker initialization timed out.');
}

function loadIdentityImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error('Image decoding timed out.')), 12_000);
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error('The captured image could not be decoded.')); };
    image.src = source;
  });
}

function percentile(histogram: Uint32Array, total: number, portion: number): number {
  const target = total * portion;
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= target) return value;
  }
  return 255;
}

function inspectAndEnhance(canvas: HTMLCanvasElement): {
  enhanced: HTMLCanvasElement;
  brightness: number;
  sharpness: number;
} {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Browser image processing is unavailable.');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixelCount = canvas.width * canvas.height;
  const luminance = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  let brightnessSum = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const value = Math.round(image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114);
    luminance[index] = value; histogram[value] += 1; brightnessSum += value;
  }

  let laplacianSum = 0; let laplacianSquared = 0; let samples = 0;
  const sampleStep = Math.max(1, Math.round(Math.max(canvas.width, canvas.height) / 1200));
  for (let y = 1; y < canvas.height - 1; y += sampleStep) {
    for (let x = 1; x < canvas.width - 1; x += sampleStep) {
      const index = y * canvas.width + x;
      const laplacian = 4 * luminance[index] - luminance[index - 1] - luminance[index + 1]
        - luminance[index - canvas.width] - luminance[index + canvas.width];
      laplacianSum += laplacian; laplacianSquared += laplacian * laplacian; samples += 1;
    }
  }
  const laplacianMean = samples ? laplacianSum / samples : 0;
  const sharpness = samples ? laplacianSquared / samples - laplacianMean * laplacianMean : 0;

  const low = percentile(histogram, pixelCount, 0.02);
  const high = percentile(histogram, pixelCount, 0.98);
  const stretch = Math.max(0.8, Math.min(1.8, 215 / Math.max(40, high - low)));
  const normalized = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    normalized[index] = Math.max(0, Math.min(255, Math.round(20 + (luminance[index] - low) * stretch)));
  }

  // Apply only a light denoise to already-sharp images, or a conservative
  // sharpen to soft images. Avoid thresholding colored security patterns.
  const detailFactor = sharpness < 60 ? 0.12 : -0.06;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const neighborMean = (normalized[index - 1] + normalized[index + 1]
        + normalized[index - canvas.width] + normalized[index + canvas.width]) / 4;
      const value = Math.max(0, Math.min(255, Math.round(
        normalized[index] * (1 + detailFactor) - neighborMean * detailFactor,
      )));
      const offset = index * 4;
      image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value;
    }
  }
  const enhanced = document.createElement('canvas');
  enhanced.width = canvas.width; enhanced.height = canvas.height;
  const enhancedContext = enhanced.getContext('2d');
  if (!enhancedContext) throw new Error('Browser image processing is unavailable.');
  enhancedContext.putImageData(image, 0, 0);
  return { enhanced, brightness: brightnessSum / Math.max(1, pixelCount), sharpness };
}

function textRegion(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (source.width / source.height < 1.2) return null;
  const left = Math.round(source.width * 0.23);
  const top = Math.round(source.height * 0.04);
  const output = document.createElement('canvas');
  output.width = source.width - left;
  output.height = Math.round(source.height * 0.92);
  const context = output.getContext('2d');
  if (!context) return null;
  context.drawImage(source, left, top, output.width, output.height, 0, 0, output.width, output.height);
  return output;
}

export async function prepareIdentityImage(source: string, selectedIdType = ''): Promise<PreparedIdentityImage> {
  const image = await loadIdentityImage(source);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (Math.max(sourceWidth, sourceHeight) < 640 || Math.min(sourceWidth, sourceHeight) < 380) {
    return {
      variants: [],
      blockingIssue: { reason: 'IMAGE_TOO_SMALL', message: 'Move your ID closer. The document must fill more of the frame.' },
    };
  }

  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(2400 / longest, Math.max(1, 1400 / longest));
  const normalized = document.createElement('canvas');
  normalized.width = Math.round(sourceWidth * scale);
  normalized.height = Math.round(sourceHeight * scale);
  const context = normalized.getContext('2d');
  if (!context) throw new Error('Browser image processing is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, normalized.width, normalized.height);
  const { enhanced, brightness, sharpness } = inspectAndEnhance(normalized);

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = 320;
  analysisCanvas.height = Math.max(180, Math.round(320 * sourceHeight / sourceWidth));
  const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
  const frameAnalysis = analysisContext
    ? (() => {
      analysisContext.drawImage(image, 0, 0, analysisCanvas.width, analysisCanvas.height);
      return analyzeDocumentFrame(analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height));
    })()
    : null;

  let recoveryIssue: ImageQualityIssue | undefined;
  if (frameAnalysis?.detected && (!frameAnalysis.cornersVisible || !frameAnalysis.aligned)) {
    recoveryIssue = frameAnalysis.instruction === 'Move your ID closer'
      ? { reason: 'IMAGE_TOO_SMALL', message: 'Move your ID closer and make sure it fills the guide.' }
      : { reason: 'CORNERS_NOT_VISIBLE', message: 'Make sure all ID corners are visible inside the guide.' };
  } else if (brightness < 48) recoveryIssue = { reason: 'LOW_LIGHT', message: 'Improve the lighting and try again.' };
  else if (brightness > 228) recoveryIssue = { reason: 'OVEREXPOSED', message: 'Reduce direct light or glare and try again.' };
  else if (sharpness < 38) recoveryIssue = { reason: 'IMAGE_BLURRY', message: 'The image is blurry. Hold your ID steady and retake it.' };

  const variants = recoveryIssue ? [enhanced, normalized] : [normalized, enhanced];
  if (/DRIVER|PRC|EMPLOYEE|COMPANY|POSTAL/i.test(selectedIdType)) {
    const region = textRegion(enhanced);
    if (region) variants.push(region);
  }
  return { variants, recoveryIssue };
}

function preferredResult(results: DocumentScreeningResult[]): DocumentScreeningResult {
  const payment = results.find((result) => result.classification === 'PAYMENT_CARD_DETECTED');
  if (payment) return payment;
  const supported = results.find((result) => result.classification === 'SUPPORTED_ID_TYPE');
  if (supported) {
    const related = results.filter((result) => result.classification !== 'UNSUPPORTED_DOCUMENT'
      && (!result.detectedIdType || result.detectedIdType === supported.detectedIdType));
    const mergedExtracted = { ...supported.extracted };
    related.forEach((result) => {
      (Object.keys(mergedExtracted) as ExtractedIdField[]).forEach((field) => {
        if (!mergedExtracted[field] && result.extracted[field]) mergedExtracted[field] = result.extracted[field];
      });
    });
    const fields = (Object.keys(mergedExtracted) as ExtractedIdField[]).filter((field) => Boolean(mergedExtracted[field]));
    return {
      ...supported,
      extracted: mergedExtracted,
      extractedFields: fields,
      warnings: [...new Set(related.filter((result) => result.classification === 'SUPPORTED_ID_TYPE')
        .flatMap((result) => result.warnings))],
    };
  }
  const unsupported = results.find((result) => result.classification === 'UNSUPPORTED_DOCUMENT');
  if (unsupported) return unsupported;
  return [...results].sort((left, right) => {
    const quality = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    return quality[right.textQuality] - quality[left.textQuality]
      || Number(Boolean(right.detectedIdType)) - Number(Boolean(left.detectedIdType));
  })[0];
}

export async function screenIdentityDocument(
  image: string,
  selectedIdType: string,
  acceptedIdTypes: readonly string[],
  onProgress?: (progress: OcrProgress) => void,
  runtime?: OcrRuntime,
): Promise<DocumentScreeningResult> {
  const cacheKey = `${selectedIdType}\u0000${acceptedIdTypes.join('\u0001')}\u0000${image}`;
  if (!runtime && cacheKey === lastKey && lastResult) return lastResult;
  const activeRuntime: OcrRuntime = runtime ?? { prepareImage: prepareIdentityImage, getWorker: worker };
  const attempts: DocumentScreeningResult[] = [];
  try {
    const prepared = await activeRuntime.prepareImage(image, selectedIdType);
    if (prepared.blockingIssue) {
      return failedDocumentScreening(prepared.blockingIssue.message, prepared.blockingIssue.reason);
    }
    const engine = await activeRuntime.getWorker(onProgress);
    for (const variant of prepared.variants.slice(0, 3)) {
      let data: OcrData;
      try {
        ({ data } = await withTimeout(engine.recognize(variant, { rotateAuto: true }), OCR_TIMEOUT_MS, 'OCR processing timed out.'));
      } catch (error) {
        if (attempts.length > 0) break;
        throw error;
      }
      const result = classifyIdentityDocument(data.text, selectedIdType, acceptedIdTypes, data.confidence);
      attempts.push(result);
      if (result.classification === 'PAYMENT_CARD_DETECTED' || result.classification === 'UNSUPPORTED_DOCUMENT') break;
      if (result.classification === 'SUPPORTED_ID_TYPE'
        && result.extracted.fullName
        && (result.extracted.expirationDate || result.extracted.idNumberLast4 || result.extracted.issuingAuthority)) break;
    }
    if (attempts.length === 0) throw new Error('OCR produced no result.');
    let result = preferredResult(attempts);
    if (result.classification === 'INCONCLUSIVE' && result.reason === 'UNREADABLE_TEXT' && prepared.recoveryIssue) {
      result = { ...result, reason: prepared.recoveryIssue.reason, warnings: [prepared.recoveryIssue.message] };
    }
    if (!runtime) { lastKey = cacheKey; lastResult = result; }
    return result;
  } catch (error) {
    if (!runtime) void resetWorker();
    // Never log the image, OCR text, document numbers, or the raw worker error.
    console.error('[visitor-ocr] OCR engine unavailable', error instanceof Error ? error.name : 'UnknownError');
    return failedDocumentScreening('OCR is temporarily unavailable. Please request assistance.', 'ENGINE_UNAVAILABLE');
  } finally {
    currentProgressHandler = undefined;
  }
}

export function clearOcrResultCache(): void {
  lastKey = '';
  lastResult = null;
}
