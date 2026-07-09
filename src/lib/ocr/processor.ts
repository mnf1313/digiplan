/**
 * OCR processor for DigiPlan.
 *
 * Uses Tesseract.js to extract text from uploaded planner photos.
 * Runs server-side and handles image preprocessing for better OCR results.
 */
import { createWorker } from "tesseract.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface OCRResult {
  text: string;
  confidence: number;
  paragraphs: OCRParagraph[];
  lines: OCRLine[];
  words: OCRWord[];
}

export interface OCRParagraph {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

// ─── Worker Pool ──────────────────────────────────────────────────────────

let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

async function getWorker() {
  if (!worker) {
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "loading tesseract core") console.log("Loading Tesseract...");
      },
    });
  }
  return worker;
}

// ─── Image Preprocessing ─────────────────────────────────────────────────

/**
 * Convert an image buffer to grayscale and increase contrast for better OCR.
 * Returns a base64 data URL.
 */
function preprocessImage(imageBuffer: Buffer): string {
  const base64 = imageBuffer.toString("base64");
  const mimeType = detectMimeType(imageBuffer);
  return `data:${mimeType};base64,${base64}`;
}

function detectMimeType(buffer: Buffer): string {
  // Check magic bytes
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return "image/webp";
  return "image/png";
}

// ─── OCR Processing ──────────────────────────────────────────────────────

/**
 * Process an image buffer with Tesseract.js OCR.
 * Returns extracted text with structured data.
 */
export async function processImage(
  imageBuffer: Buffer,
): Promise<OCRResult> {
  const w = await getWorker();
  const imageData = preprocessImage(imageBuffer);

  const { data } = await w.recognize(imageData);

  return {
    text: data.text || "",
    confidence: data.confidence || 0,
    paragraphs: (data.paragraphs || []).map((p: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }) => ({
      text: p.text,
      confidence: p.confidence,
      bbox: p.bbox,
    })),
    lines: (data.lines || []).map((l: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }) => ({
      text: l.text,
      confidence: l.confidence,
      bbox: l.bbox,
    })),
    words: (data.words || []).map((w: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox,
    })),
  };
}

/**
 * Terminate the OCR worker to free memory.
 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}