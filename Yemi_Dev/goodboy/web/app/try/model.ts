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

export type Box = [number, number, number, number]; // x1,y1,x2,y2 normalized 0..1
export type Verdict = { label: Label; conf: number; scores: number[]; box: Box; ms: number };
export type Detection = { label: Label; conf: number; box: Box };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ort?: any;
  }
}

let ortPromise: Promise<any> | null = null;
let sessionPromise: Promise<any> | null = null;
let ortRef: any = null;
export let activeBackend = "";

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  );
}

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

    // Cache the 34MB model in Cache Storage so repeat visits load instantly.
    let res: Response | null = null;
    let cache: Cache | null = null;
    try {
      if (typeof caches !== "undefined") {
        cache = await caches.open("gb-model-v1");
        res = (await cache.match(MODEL_URL)) || null;
      }
    } catch {
      /* cache unavailable -> network */
    }
    const fromCache = !!res;
    if (!res) res = await fetch(MODEL_URL);
    if (cache && !fromCache && res.ok) {
      cache.put(MODEL_URL, res.clone()).catch(() => {});
    }
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

    // Mobile Safari's WebGPU accumulates memory and auto-reloads the tab under
    // pressure, so force the bounded/reused WASM heap there. Desktop keeps the
    // fast WebGPU path (WASM fallback).
    const providers = isMobile() ? ["wasm"] : ["webgpu", "wasm"];
    for (const ep of providers) {
      try {
        const s = await ort.InferenceSession.create(bytes, {
          executionProviders: [ep],
          graphOptimizationLevel: "all",
        });
        activeBackend = ep;
        return s;
      } catch {
        /* try next provider */
      }
    }
    throw new Error("no execution provider could load the model");
  })();
  await sessionPromise;
}

// Reused across every frame. Allocating a new canvas + buffers per inference
// (the old behavior) leaks memory fast and crashes mobile Safari's tab.
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
let _inputBuf: Float32Array | null = null;

export function preprocess(src: CanvasImageSource): Float32Array {
  if (!_canvas) {
    _canvas = document.createElement("canvas");
    _canvas.width = SIZE;
    _canvas.height = SIZE;
    _ctx = _canvas.getContext("2d", { willReadFrequently: true });
    _inputBuf = new Float32Array(3 * SIZE * SIZE);
  }
  const ctx = _ctx!;
  ctx.drawImage(src, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const out = _inputBuf!;
  const plane = SIZE * SIZE;
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * plane + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    }
  }
  return out;
}

const sig = (x: number) => 1 / (1 + Math.exp(-x));

// dets are [cx,cy,w,h] normalized -> [x1,y1,x2,y2] normalized, clamped
function toBox(dets: Float32Array, q: number): Box {
  const cx = dets[q * 4], cy = dets[q * 4 + 1], w = dets[q * 4 + 2], h = dets[q * 4 + 3];
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  return [cl(cx - w / 2), cl(cy - h / 2), cl(cx + w / 2), cl(cy + h / 2)];
}

async function runModel(src: CanvasImageSource) {
  if (!sessionPromise || !ortRef) throw new Error("model not loaded");
  const session = await sessionPromise;
  const tensor = new ortRef.Tensor("float32", preprocess(src), [1, 3, SIZE, SIZE]);
  const t0 = performance.now();
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const ms = performance.now() - t0;
  // copy out before disposing the tensors (frees backing buffers, esp. GPU)
  const labels = (out["labels"].data as Float32Array).slice();
  const C = out["labels"].dims[2] as number;
  const dets = (out["dets"].data as Float32Array).slice();
  for (const k in out) (out[k] as { dispose?: () => void })?.dispose?.();
  (tensor as { dispose?: () => void })?.dispose?.();
  return { labels, dets, C, ms };
}

export async function classify(src: CanvasImageSource): Promise<Verdict> {
  const { labels, dets, C, ms } = await runModel(src);
  let bestQ = 0, bestC = 0, best = -1;
  for (let q = 0; q < 300; q++) {
    for (let c = 0; c < 3; c++) {
      const s = sig(labels[q * C + c]);
      if (s > best) { best = s; bestQ = q; bestC = c; }
    }
  }
  const scores = [0, 1, 2].map((c) => sig(labels[bestQ * C + c]));
  return { label: LABELS[bestC], conf: best, scores, box: toBox(dets, bestQ), ms };
}

// All confident detections (NMS-free) -> multi-dog. Dedups near-identical boxes.
export async function classifyAll(
  src: CanvasImageSource,
  threshold = 0.5,
  max = 6,
): Promise<{ dets: Detection[]; ms: number }> {
  const { labels, dets, C, ms } = await runModel(src);
  const found: Detection[] = [];
  for (let q = 0; q < 300; q++) {
    let bc = 0, bs = -1;
    for (let c = 0; c < 3; c++) {
      const s = sig(labels[q * C + c]);
      if (s > bs) { bs = s; bc = c; }
    }
    if (bs >= threshold) found.push({ label: LABELS[bc], conf: bs, box: toBox(dets, q) });
  }
  found.sort((a, b) => b.conf - a.conf);
  const kept: Detection[] = [];
  for (const d of found) {
    const cx = (d.box[0] + d.box[2]) / 2, cy = (d.box[1] + d.box[3]) / 2;
    const dup = kept.some((k) => {
      const kx = (k.box[0] + k.box[2]) / 2, ky = (k.box[1] + k.box[3]) / 2;
      return Math.abs(kx - cx) < 0.08 && Math.abs(ky - cy) < 0.08;
    });
    if (!dup) kept.push(d);
    if (kept.length >= max) break;
  }
  return { dets: kept, ms };
}
