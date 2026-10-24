import { describe, expect, it } from 'vitest';
import {
  advanceAutoCapture,
  analyzeDocumentFrame,
  type AutoCaptureState,
  type DocumentFrameAnalysis,
  type NormalizedQuad,
} from './idDocumentDetection';

function syntheticIdFrame(
  cardLevel = 165,
  backgroundLevel = 28,
  card = { x: 52, y: 32, width: 216, height: 136 },
) {
  const width = 320; const height = 200;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height;
      const border = inside && (x - card.x < 3 || card.x + card.width - x < 3 || y - card.y < 3 || card.y + card.height - y < 3);
      const text = inside && x > card.x + 18 && x < card.x + card.width - 16 && y > card.y + 18 && (y - card.y) % 15 < 3;
      const value = border ? Math.min(235, cardLevel + 60) : text ? Math.max(12, cardLevel - 80) : inside ? cardLevel : backgroundLevel;
      const offset = (y * width + x) * 4;
      data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

function addGlare(frame: ImageData) {
  for (let y = 65; y < 115; y += 1) {
    for (let x = 120; x < 195; x += 1) {
      const offset = (y * frame.width + x) * 4;
      frame.data[offset] = 255; frame.data[offset + 1] = 255; frame.data[offset + 2] = 255;
    }
  }
  return frame;
}

const quad: NormalizedQuad = [
  { x: 0.18, y: 0.2 }, { x: 0.82, y: 0.2 }, { x: 0.82, y: 0.8 }, { x: 0.18, y: 0.8 },
];

function readyAnalysis(overrides: Partial<DocumentFrameAnalysis> = {}): DocumentFrameAnalysis {
  return {
    state: 'green', instruction: 'ID detected — Hold steady', detected: true, cornersVisible: true,
    aligned: true, sharp: true, lightingOk: true, glareOk: true, brightness: 150, sharpness: 200,
    glareRatio: 0, confidence: 0.95, quad, signature: [100, 120], motionScore: 0, ...overrides,
  };
}

describe('ID document detection', () => {
  it('uses visual edges and four corners to recognize an aligned, sharp ID', () => {
    const first = analyzeDocumentFrame(syntheticIdFrame());
    const result = analyzeDocumentFrame(syntheticIdFrame(), first.signature);
    expect(result.detected).toBe(true);
    expect(result.cornersVisible).toBe(true);
    expect(result.aligned).toBe(true);
    expect(result.sharp).toBe(true);
    expect(result.state).toBe('green');
    expect(result.quad).toHaveLength(4);
  });

  it('keeps a visually detected ID yellow when lighting is insufficient', () => {
    const result = analyzeDocumentFrame(syntheticIdFrame(38, 5));
    expect(result.detected).toBe(true);
    expect(result.lightingOk).toBe(false);
    expect(result.state).toBe('yellow');
    expect(result.instruction).toMatch(/lighting/i);
  });

  it('warns instead of capturing when excessive glare covers the document', () => {
    const result = analyzeDocumentFrame(addGlare(syntheticIdFrame()));
    expect(result.detected).toBe(true);
    expect(result.glareOk).toBe(false);
    expect(result.state).toBe('yellow');
    expect(result.instruction).toMatch(/glare/i);
  });

  it('does not simulate detection when no rectangular document edges exist', () => {
    const width = 320; const height = 200;
    const data = new Uint8ClampedArray(width * height * 4).fill(80);
    expect(analyzeDocumentFrame({ width, height, data } as ImageData)).toMatchObject({ detected: false, state: 'red' });
  });

  it('does not produce a green capture state for a partially cropped document', () => {
    const result = analyzeDocumentFrame(syntheticIdFrame(165, 28, { x: -18, y: 32, width: 216, height: 136 }));
    expect(result.state).not.toBe('green');
    expect(result.cornersVisible && result.aligned).toBe(false);
  });
});

describe('automatic capture stability', () => {
  it('captures only after a clear aligned frame remains stable for the hold period', () => {
    const initial: AutoCaptureState = { stableSince: null, progress: 0, captured: false, lastQuad: null };
    const started = advanceAutoCapture(initial, readyAnalysis(), 1000);
    const halfway = advanceAutoCapture(started, readyAnalysis(), 1700);
    const captured = advanceAutoCapture(halfway, readyAnalysis(), 2400);
    expect(started.progress).toBe(0);
    expect(halfway.progress).toBeCloseTo(0.5);
    expect(captured.captured).toBe(true);
  });

  it('resets the countdown after movement and prevents duplicate captures', () => {
    const stable: AutoCaptureState = { stableSince: 1000, progress: 0.7, captured: false, lastQuad: quad };
    const movedQuad = quad.map((point) => ({ x: point.x + 0.08, y: point.y })) as NormalizedQuad;
    const reset = advanceAutoCapture(stable, readyAnalysis({ quad: movedQuad, motionScore: 35 }), 2200);
    expect(reset.progress).toBe(0);
    expect(reset.stableSince).toBe(2200);

    const captured = { ...stable, captured: true, progress: 1 };
    expect(advanceAutoCapture(captured, readyAnalysis(), 5000)).toBe(captured);
  });

  it('does not begin automatic capture for blurry or otherwise rejected frames', () => {
    const initial: AutoCaptureState = { stableSince: null, progress: 0, captured: false, lastQuad: null };
    const rejected = readyAnalysis({ state: 'yellow', sharp: false, instruction: 'Hold steady and wait for focus' });
    expect(advanceAutoCapture(initial, rejected, 1000)).toEqual({ stableSince: null, progress: 0, captured: false, lastQuad: quad });
  });
});
