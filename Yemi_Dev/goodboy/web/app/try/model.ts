// In-browser RF-DETR inference. onnxruntime-web is loaded from the CDN as a
// global (NOT bundled) — its .mjs uses import.meta, which webpack/Terser can't
// process. Loading via a <script> tag sidesteps the whole bundler issue.

export const SIZE = 384;
export const LABELS = ["sit", "down", "stand"] as const;
export type Label = (typeof LABELS)[number];
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const MODEL_URL = "/model/rfdetr-nano-int8.onnx";
const ORT_VER = "1.26.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;

export type Verdict = { label: Label; conf: number; scores: number[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ort?: any;
  }
}

let ortPromise: Promise<any> | null = null;
let sessionPromise: Promise<any> | null = null;
let ortRef: any = null;

function loadOrt(): Promise<any> {
  if (typeof window !== "undefined" && window.ort) return Promise.resolve(window.ort);
  if (ortPromise) return ortPromise;
  ortPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${ORT_BASE}ort.webgpu.min.js`;
    s.async = true;
    s.onload = () => {
      const ort = window.ort;
      if (!ort) return reject(new Error("onnxruntime-web did not initialize"));
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      resolve(ort);
    };
    s.onerror = () => reject(new Error("failed to load onnxruntime-web"));
    document.head.appendChild(s);
  });
  return ortPromise;
}

export async function loadModel(onProgress?: (frac: number) => void): Promise<void> {
  if (sessionPromise) {
    await sessionPromise;
    return;
  }
  sessionPromise = (async () => {
    const ort = await loadOrt();
    ortRef = ort;

    const res = await fetch(MODEL_URL);
    const total = Number(res.headers.get("content-length") || 0);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(received / total);
    }
    const bytes = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    onProgress?.(1);

    try {
      return await ort.InferenceSession.create(bytes, {
        executionProviders: ["webgpu"],
        graphOptimizationLevel: "all",
      });
    } catch {
      return await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    }
  })();
  await sessionPromise;
}

export function preprocess(src: CanvasImageSource): Float32Array {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const out = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * plane + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    }
  }
  return out;
}

export async function classify(src: CanvasImageSource): Promise<Verdict> {
  if (!sessionPromise || !ortRef) throw new Error("model not loaded");
  const session = await sessionPromise;
  const tensor = new ortRef.Tensor("float32", preprocess(src), [1, 3, SIZE, SIZE]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const labelsT = out["labels"];
  const labels = labelsT.data as Float32Array;
  const C = labelsT.dims[2];
  const sig = (x: number) => 1 / (1 + Math.exp(-x));

  let bestQ = 0,
    bestC = 0,
    best = -1;
  for (let q = 0; q < 300; q++) {
    for (let c = 0; c < 3; c++) {
      const s = sig(labels[q * C + c]);
      if (s > best) {
        best = s;
        bestQ = q;
        bestC = c;
      }
    }
  }
  const scores = [0, 1, 2].map((c) => sig(labels[bestQ * C + c]));
  return { label: LABELS[bestC], conf: best, scores };
}
