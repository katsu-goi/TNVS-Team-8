import { classifyIdentityDocument, failedDocumentScreening, type DocumentScreeningResult } from './visitorDocumentScreening';

type OcrProgress = { status: string; progress: number };
type WorkerLike = {
  recognize(image: string): Promise<{ data: { text: string; confidence: number } }>;
};

let workerPromise: Promise<WorkerLike> | null = null;
let lastImage = '';
let lastResult: DocumentScreeningResult | null = null;

async function worker(onProgress?: (progress: OcrProgress) => void): Promise<WorkerLike> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async ({ createWorker }) => {
      const created = await createWorker('eng', undefined, {
        langPath: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/tessdata`,
        logger: (message) => onProgress?.({ status: message.status, progress: message.progress }),
      });
      return created as WorkerLike;
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function screenIdentityDocument(
  image: string,
  selectedIdType: string,
  acceptedIdTypes: readonly string[],
  onProgress?: (progress: OcrProgress) => void,
): Promise<DocumentScreeningResult> {
  if (image === lastImage && lastResult) return lastResult;
  try {
    const engine = await worker(onProgress);
    const { data } = await engine.recognize(image);
    const result = classifyIdentityDocument(data.text, selectedIdType, acceptedIdTypes, data.confidence);
    lastImage = image;
    lastResult = result;
    return result;
  } catch {
    return failedDocumentScreening('OCR could not read this image. Retake the ID or request the approved manual alternative.');
  }
}

export function clearOcrResultCache(): void {
  lastImage = '';
  lastResult = null;
}
