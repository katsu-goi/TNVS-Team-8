export type ScanGuideState = 'red' | 'yellow' | 'green';

export type Point = { x: number; y: number };
export type NormalizedQuad = [Point, Point, Point, Point];

export type DocumentFrameAnalysis = {
  state: ScanGuideState;
  instruction: string;
  detected: boolean;
  cornersVisible: boolean;
  aligned: boolean;
  sharp: boolean;
  lightingOk: boolean;
  glareOk: boolean;
  brightness: number;
  sharpness: number;
  glareRatio: number;
  confidence: number;
  quad: NormalizedQuad | null;
  signature: number[];
  motionScore: number;
};

export type AutoCaptureState = {
  stableSince: number | null;
  progress: number;
  captured: boolean;
  lastQuad: NormalizedQuad | null;
};

type PixelFrame = Pick<ImageData, 'data' | 'width' | 'height'>;

const CARD_RATIO_MIN = 1.28;
const CARD_RATIO_MAX = 1.9;
export const AUTO_CAPTURE_HOLD_MS = 1400;

export function guideRect(width: number, height: number) {
  const targetRatio = 1.586;
  let guideWidth = width * 0.78;
  let guideHeight = guideWidth / targetRatio;
  if (guideHeight > height * 0.68) {
    guideHeight = height * 0.68;
    guideWidth = guideHeight * targetRatio;
  }
  return {
    x: (width - guideWidth) / 2,
    y: (height - guideHeight) / 2,
    width: guideWidth,
    height: guideHeight,
  };
}

function peak(profile: Float32Array, start: number, end: number): { index: number; value: number } {
  let index = Math.max(0, Math.floor(start));
  let value = -1;
  const last = Math.min(profile.length - 1, Math.ceil(end));
  for (let i = index; i <= last; i += 1) {
    if (profile[i] > value) { index = i; value = profile[i]; }
  }
  return { index, value };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadBounds(quad: NormalizedQuad) {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function weightedLineX(
  gradient: Uint16Array,
  width: number,
  height: number,
  roughX: number,
  top: number,
  bottom: number,
): { slope: number; intercept: number } {
  const band = Math.max(3, Math.round(width * 0.045));
  let weight = 0; let sy = 0; let sx = 0; let syy = 0; let syx = 0;
  for (let y = Math.max(1, top); y <= Math.min(height - 2, bottom); y += 1) {
    for (let x = Math.max(1, roughX - band); x <= Math.min(width - 2, roughX + band); x += 1) {
      const w = gradient[y * width + x];
      if (w < 24) continue;
      weight += w; sy += w * y; sx += w * x; syy += w * y * y; syx += w * y * x;
    }
  }
  const denominator = weight * syy - sy * sy;
  if (weight < 100 || Math.abs(denominator) < 1) return { slope: 0, intercept: roughX };
  const slope = (weight * syx - sy * sx) / denominator;
  return { slope, intercept: (sx - slope * sy) / weight };
}

function weightedLineY(
  gradient: Uint16Array,
  width: number,
  height: number,
  roughY: number,
  left: number,
  right: number,
): { slope: number; intercept: number } {
  const band = Math.max(3, Math.round(height * 0.05));
  let weight = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let y = Math.max(1, roughY - band); y <= Math.min(height - 2, roughY + band); y += 1) {
    for (let x = Math.max(1, left); x <= Math.min(width - 2, right); x += 1) {
      const w = gradient[y * width + x];
      if (w < 24) continue;
      weight += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
    }
  }
  const denominator = weight * sxx - sx * sx;
  if (weight < 100 || Math.abs(denominator) < 1) return { slope: 0, intercept: roughY };
  const slope = (weight * sxy - sx * sy) / denominator;
  return { slope, intercept: (sy - slope * sx) / weight };
}

function lineIntersection(
  vertical: { slope: number; intercept: number },
  horizontal: { slope: number; intercept: number },
): Point {
  const denominator = 1 - vertical.slope * horizontal.slope;
  if (Math.abs(denominator) < 0.02) return { x: vertical.intercept, y: horizontal.intercept };
  const y = (horizontal.slope * vertical.intercept + horizontal.intercept) / denominator;
  return { x: vertical.slope * y + vertical.intercept, y };
}

function sampleSignature(gray: Uint8Array, width: number, height: number): number[] {
  const signature: number[] = [];
  for (let row = 0; row < 6; row += 1) {
    const y = Math.min(height - 1, Math.round(((row + 0.5) / 6) * height));
    for (let column = 0; column < 10; column += 1) {
      const x = Math.min(width - 1, Math.round(((column + 0.5) / 10) * width));
      signature.push(gray[y * width + x]);
    }
  }
  return signature;
}

function signatureDifference(current: number[], previous?: number[]): number {
  if (!previous || previous.length !== current.length) return Number.POSITIVE_INFINITY;
  return current.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / current.length;
}

export function analyzeDocumentFrame(frame: PixelFrame, previousSignature?: number[]): DocumentFrameAnalysis {
  const { width, height, data } = frame;
  const pixelCount = width * height;
  if (width < 80 || height < 60 || data.length < pixelCount * 4) {
    return {
      state: 'red', instruction: 'Waiting for a valid camera frame', detected: false, cornersVisible: false,
      aligned: false, sharp: false, lightingOk: false, glareOk: false, brightness: 0, sharpness: 0,
      glareRatio: 0, confidence: 0, quad: null, signature: [], motionScore: Number.POSITIVE_INFINITY,
    };
  }

  const gray = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    gray[i] = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
  }
  const signature = sampleSignature(gray, width, height);
  const motionScore = signatureDifference(signature, previousSignature);
  const gradientX = new Uint16Array(pixelCount);
  const gradientY = new Uint16Array(pixelCount);
  const verticalProfile = new Float32Array(width);
  const horizontalProfile = new Float32Array(height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = Math.abs(
        -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1]
        + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1],
      );
      const gy = Math.abs(
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
        + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1],
      );
      gradientX[i] = gx;
      gradientY[i] = gy;
      if (y > height * 0.08 && y < height * 0.92) verticalProfile[x] += gx;
      if (x > width * 0.08 && x < width * 0.92) horizontalProfile[y] += gy;
    }
  }
  const verticalDivisor = Math.max(1, height * 0.84);
  const horizontalDivisor = Math.max(1, width * 0.84);
  for (let x = 0; x < width; x += 1) verticalProfile[x] /= verticalDivisor;
  for (let y = 0; y < height; y += 1) horizontalProfile[y] /= horizontalDivisor;

  const leftPeak = peak(verticalProfile, width * 0.04, width * 0.46);
  const rightPeak = peak(verticalProfile, width * 0.54, width * 0.96);
  const topPeak = peak(horizontalProfile, height * 0.04, height * 0.46);
  const bottomPeak = peak(horizontalProfile, height * 0.54, height * 0.96);
  const edgeStrength = Math.min(leftPeak.value, rightPeak.value, topPeak.value, bottomPeak.value);
  const roughWidth = rightPeak.index - leftPeak.index;
  const roughHeight = bottomPeak.index - topPeak.index;
  const roughRatio = roughHeight > 0 ? roughWidth / roughHeight : 0;
  const detected = edgeStrength >= 18 && roughWidth > width * 0.32 && roughHeight > height * 0.24
    && roughRatio >= CARD_RATIO_MIN && roughRatio <= CARD_RATIO_MAX;

  if (!detected) {
    return {
      state: 'red', instruction: 'Position your ID inside the frame', detected: false, cornersVisible: false,
      aligned: false, sharp: false, lightingOk: false, glareOk: false, brightness: 0, sharpness: 0,
      glareRatio: 0, confidence: Math.min(0.35, edgeStrength / 80), quad: null, signature, motionScore,
    };
  }

  const leftLine = weightedLineX(gradientX, width, height, leftPeak.index, topPeak.index, bottomPeak.index);
  const rightLine = weightedLineX(gradientX, width, height, rightPeak.index, topPeak.index, bottomPeak.index);
  const topLine = weightedLineY(gradientY, width, height, topPeak.index, leftPeak.index, rightPeak.index);
  const bottomLine = weightedLineY(gradientY, width, height, bottomPeak.index, leftPeak.index, rightPeak.index);
  const pixelQuad = [
    lineIntersection(leftLine, topLine), lineIntersection(rightLine, topLine),
    lineIntersection(rightLine, bottomLine), lineIntersection(leftLine, bottomLine),
  ] as NormalizedQuad;
  const normalizedQuad = pixelQuad.map((point) => ({ x: point.x / width, y: point.y / height })) as NormalizedQuad;
  const bounds = quadBounds(normalizedQuad);
  const cornersVisible = normalizedQuad.every((point) => point.x > 0.015 && point.x < 0.985 && point.y > 0.015 && point.y < 0.985);
  const cardRatio = ((distance(pixelQuad[0], pixelQuad[1]) + distance(pixelQuad[3], pixelQuad[2])) / 2)
    / Math.max(0.001, (distance(pixelQuad[0], pixelQuad[3]) + distance(pixelQuad[1], pixelQuad[2])) / 2);

  const guide = guideRect(width, height);
  const normalizedGuide = { x: guide.x / width, y: guide.y / height, width: guide.width / width, height: guide.height / height };
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const centerAligned = Math.abs(centerX - 0.5) < normalizedGuide.width * 0.1
    && Math.abs(centerY - 0.5) < normalizedGuide.height * 0.12;
  const cardSizeOk = bounds.width >= normalizedGuide.width * 0.72 && bounds.width <= normalizedGuide.width * 1.06
    && bounds.height >= normalizedGuide.height * 0.68 && bounds.height <= normalizedGuide.height * 1.08;
  const margin = 0.035;
  const insideGuide = normalizedQuad.every((point) => point.x >= normalizedGuide.x - margin
    && point.x <= normalizedGuide.x + normalizedGuide.width + margin
    && point.y >= normalizedGuide.y - margin
    && point.y <= normalizedGuide.y + normalizedGuide.height + margin);
  const aligned = cornersVisible && centerAligned && cardSizeOk && insideGuide && cardRatio >= CARD_RATIO_MIN && cardRatio <= CARD_RATIO_MAX;

  const x0 = Math.max(1, Math.floor(bounds.x * width));
  const x1 = Math.min(width - 2, Math.ceil((bounds.x + bounds.width) * width));
  const y0 = Math.max(1, Math.floor(bounds.y * height));
  const y1 = Math.min(height - 2, Math.ceil((bounds.y + bounds.height) * height));
  let brightnessSum = 0; let glarePixels = 0; let samples = 0; let lapSum = 0; let lapSquared = 0;
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const i = y * width + x;
      const luminance = gray[i];
      brightnessSum += luminance;
      const offset = i * 4;
      const maxChannel = Math.max(data[offset], data[offset + 1], data[offset + 2]);
      const minChannel = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      if (luminance > 242 && maxChannel - minChannel < 24) glarePixels += 1;
      const laplacian = 4 * luminance - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += laplacian; lapSquared += laplacian * laplacian; samples += 1;
    }
  }
  const brightness = samples ? brightnessSum / samples : 0;
  const glareRatio = samples ? glarePixels / samples : 1;
  const lapMean = samples ? lapSum / samples : 0;
  const sharpness = samples ? lapSquared / samples - lapMean * lapMean : 0;
  const lightingOk = brightness >= 55 && brightness <= 220;
  const glareOk = glareRatio <= 0.075;
  const sharp = sharpness >= 55;
  const qualityReady = cornersVisible && aligned && sharp && lightingOk && glareOk;
  const confidence = Math.max(0, Math.min(1,
    0.25 + Math.min(0.25, edgeStrength / 180) + (cornersVisible ? 0.15 : 0)
    + (aligned ? 0.2 : 0) + (sharp && lightingOk && glareOk ? 0.15 : 0),
  ));

  let instruction = 'ID detected — align all four corners';
  if (bounds.width < normalizedGuide.width * 0.72) instruction = 'Move your ID closer';
  else if (bounds.width > normalizedGuide.width * 1.06) instruction = 'Move your ID farther away';
  else if (!centerAligned || !insideGuide || !cornersVisible) instruction = 'Center the complete ID inside the frame';
  else if (!lightingOk) instruction = brightness < 55 ? 'Improve lighting' : 'Reduce direct light';
  else if (!glareOk) instruction = 'Tilt the ID slightly to reduce glare';
  else if (!sharp) instruction = 'Hold steady and wait for focus';
  else instruction = 'ID detected — Hold steady';

  return {
    state: qualityReady ? 'green' : 'yellow', instruction, detected: true, cornersVisible, aligned,
    sharp, lightingOk, glareOk, brightness, sharpness, glareRatio, confidence,
    quad: normalizedQuad, signature, motionScore,
  };
}

function quadChange(previous: NormalizedQuad | null, current: NormalizedQuad | null): number {
  if (!previous || !current) return Number.POSITIVE_INFINITY;
  return Math.max(...current.map((point, index) => distance(point, previous[index])));
}

export function advanceAutoCapture(
  previous: AutoCaptureState,
  analysis: DocumentFrameAnalysis,
  now: number,
): AutoCaptureState {
  if (previous.captured) return previous;
  const qualityReady = analysis.state === 'green' && analysis.quad !== null;
  const stableGeometry = quadChange(previous.lastQuad, analysis.quad) <= 0.025;
  const stablePixels = Number.isFinite(analysis.motionScore) && analysis.motionScore <= 18;
  if (!qualityReady) return { stableSince: null, progress: 0, captured: false, lastQuad: analysis.quad };
  const stableSince = stableGeometry && stablePixels && previous.stableSince !== null ? previous.stableSince : now;
  const progress = Math.max(0, Math.min(1, (now - stableSince) / AUTO_CAPTURE_HOLD_MS));
  return { stableSince, progress, captured: progress >= 1, lastQuad: analysis.quad };
}

function interpolateQuad(quad: Point[], u: number, v: number): Point {
  const top = { x: quad[0].x + (quad[1].x - quad[0].x) * u, y: quad[0].y + (quad[1].y - quad[0].y) * u };
  const bottom = { x: quad[3].x + (quad[2].x - quad[3].x) * u, y: quad[3].y + (quad[2].y - quad[3].y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourcePoints: [Point, Point, Point],
  destinationPoints: [Point, Point, Point],
) {
  const [s0, s1, s2] = sourcePoints;
  const [d0, d1, d2] = destinationPoints;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 0.001) return;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  context.save();
  context.beginPath(); context.moveTo(d0.x, d0.y); context.lineTo(d1.x, d1.y); context.lineTo(d2.x, d2.y); context.closePath(); context.clip();
  context.setTransform(a, b, c, d, e, f); context.drawImage(source, 0, 0); context.restore();
}

function perspectiveCrop(source: HTMLCanvasElement, quad: NormalizedQuad): HTMLCanvasElement | null {
  const center = quad.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  const expandedQuad = quad.map((point) => ({
    x: Math.max(0, Math.min(1, center.x + (point.x - center.x) * 1.035)),
    y: Math.max(0, Math.min(1, center.y + (point.y - center.y) * 1.035)),
  }));
  const sourceQuad = expandedQuad.map((point) => ({ x: point.x * source.width, y: point.y * source.height }));
  const horizontal = (distance(sourceQuad[0], sourceQuad[1]) + distance(sourceQuad[3], sourceQuad[2])) / 2;
  const vertical = (distance(sourceQuad[0], sourceQuad[3]) + distance(sourceQuad[1], sourceQuad[2])) / 2;
  const ratio = horizontal / Math.max(1, vertical);
  if (horizontal < 640 || vertical < 380 || ratio < CARD_RATIO_MIN || ratio > CARD_RATIO_MAX) return null;
  const output = document.createElement('canvas');
  output.width = Math.min(1800, Math.round(horizontal));
  output.height = Math.round(output.width / ratio);
  const context = output.getContext('2d');
  if (!context) return null;
  const columns = 12; const rows = 8;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns; const u1 = (column + 1) / columns;
      const v0 = row / rows; const v1 = (row + 1) / rows;
      const s00 = interpolateQuad(sourceQuad, u0, v0); const s10 = interpolateQuad(sourceQuad, u1, v0);
      const s11 = interpolateQuad(sourceQuad, u1, v1); const s01 = interpolateQuad(sourceQuad, u0, v1);
      const d00 = { x: u0 * output.width, y: v0 * output.height }; const d10 = { x: u1 * output.width, y: v0 * output.height };
      const d11 = { x: u1 * output.width, y: v1 * output.height }; const d01 = { x: u0 * output.width, y: v1 * output.height };
      drawTriangle(context, source, [s00, s10, s11], [d00, d10, d11]);
      drawTriangle(context, source, [s00, s11, s01], [d00, d11, d01]);
    }
  }
  return output;
}

export function captureDocumentFrame(video: HTMLVideoElement, analysis: DocumentFrameAnalysis | null): string | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    || Math.max(video.videoWidth, video.videoHeight) < 640
    || Math.min(video.videoWidth, video.videoHeight) < 400) return null;
  const scale = Math.min(1, 2000 / Math.max(video.videoWidth, video.videoHeight));
  const source = document.createElement('canvas');
  source.width = Math.round(video.videoWidth * scale); source.height = Math.round(video.videoHeight * scale);
  const context = source.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, source.width, source.height);
  const corrected = analysis?.quad && analysis.cornersVisible && analysis.confidence >= 0.72
    ? perspectiveCrop(source, analysis.quad)
    : null;
  return (corrected ?? source).toDataURL('image/jpeg', 0.92);
}
