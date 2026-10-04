import { EXAMPLES } from "../vm";
import { LAYERS, type Layer } from "./graph";
import type { Primitive } from "../gates";
import { COMPARE_PRESETS, type ComparePreset } from "./compare";

export const CONCEPTS = ["arithmetic", "memory", "decision", "loop", "function", "array", "io", "pointer", "bitwise"] as const;
export type ConceptId = typeof CONCEPTS[number];
export interface ShareState {
  mode: "guided" | "explorer" | "compare" | "showcase";
  source?: string; rightSource?: string; concept?: ConceptId; step?: number;
  layer?: Layer; cycle?: number; rightCycle?: number; focus?: string; bit?: number; primitive?: Primitive; keyboard?: number;
  preset?: ComparePreset; pair?: number;
}
export const MAX_SHARE_LENGTH = 8000;
const DEFAULT: ShareState = { mode: "guided" };
// Small LZSS codec: 12-bit backwards distance, 4-bit match length (3..18).
// No server storage, source evaluation, or browser-only dependency.
function compress(bytes: Uint8Array) {
  const out: number[] = [], positions = new Map<string, number[]>(); let i = 0;
  const key = (at: number) => `${bytes[at]},${bytes[at + 1]},${bytes[at + 2]}`;
  while (i < bytes.length) {
    const flagIndex = out.length; out.push(0); let flags = 0;
    for (let bit = 0; bit < 8 && i < bytes.length; bit++) {
      let length = 0, distance = 0;
      for (const at of (positions.get(key(i)) ?? []).slice(-64).reverse()) {
        if (i - at > 4095) break;
        let n = 0; while (n < 18 && i + n < bytes.length && bytes[at + n] === bytes[i + n]) n++;
        if (n >= 3 && n > length) { length = n; distance = i - at; }
      }
      if (length >= 3) { flags |= 1 << bit; const code = (distance << 4) | (length - 3); out.push(code >> 8, code & 255); }
      else { length = 1; out.push(bytes[i]); }
      for (let n = 0; n < length; n++) { const k = key(i + n), list = positions.get(k) ?? []; list.push(i + n); if (list.length > 64) list.shift(); positions.set(k, list); }
      i += length;
    }
    out[flagIndex] = flags;
  }
  return new Uint8Array(out);
}
function decompress(bytes: Uint8Array) {
  const out: number[] = []; let i = 0;
  while (i < bytes.length) {
    const flags = bytes[i++];
    for (let bit = 0; bit < 8 && i < bytes.length; bit++) {
      if (flags & (1 << bit)) {
        if (i + 1 >= bytes.length) throw new Error("Truncated link");
        const code = (bytes[i++] << 8) | bytes[i++], distance = code >> 4, length = (code & 15) + 3;
        if (!distance || distance > out.length) throw new Error("Invalid link");
        for (let n = 0; n < length; n++) out.push(out[out.length - distance]);
      } else out.push(bytes[i++]);
      if (out.length > 30000) throw new Error("Link is too large");
    }
  }
  return new Uint8Array(out);
}
function validate(v: unknown): ShareState | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>;
  if (!["guided", "explorer", "compare", "showcase"].includes(String(s.mode))) return null;
  for (const k of ["source", "rightSource"]) if (s[k] !== undefined && (typeof s[k] !== "string" || (s[k] as string).length > 12000 || !(s[k] as string).trim())) return null;
  const enums: Record<string, readonly string[]> = { layer: LAYERS, concept: CONCEPTS, primitive: ["xor", "and", "or", "not"], preset: Object.keys(COMPARE_PRESETS) };
  for (const [k, values] of Object.entries(enums)) if (s[k] !== undefined && !values.includes(s[k] as string)) return null;
  for (const [k, max] of Object.entries({ cycle: 11999, rightCycle: 11999, bit: 15, step: 20, pair: 12000, keyboard: 65535 })) if (s[k] !== undefined && (!Number.isInteger(s[k]) || Number(s[k]) < 0 || Number(s[k]) > max)) return null;
  if (s.focus !== undefined && (typeof s.focus !== "string" || s.focus.length > 240 || !/^source:[\w:.-]+$/.test(s.focus))) return null;
  // Strip unrecognized properties so a URL is data, never executable instructions.
  return Object.fromEntries(Object.entries(s).filter(([k]) => ["mode", "source", "rightSource", "concept", "step", "layer", "cycle", "rightCycle", "focus", "bit", "primitive", "keyboard", "preset", "pair"].includes(k))) as unknown as ShareState;
}
export function serializeShareState(state: ShareState) {
  if (!validate(state)) throw new Error("This view cannot be shared.");
  const { source, rightSource, ...rest } = state;
  const example = Object.entries(EXAMPLES).find(([, s]) => s === source)?.[0];
  const payload = { v: 1, ...rest, ...(example ? { example } : source ? { source } : {}), ...(rightSource ? { rightSource } : {}) };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  if (encoded.length > 30000) throw new Error("This view exceeds the shared-link data limit. Shorten the program before sharing.");
  const bytes = compress(encoded);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (token.length > MAX_SHARE_LENGTH) throw new Error("This program makes a link longer than 8,000 characters. Shorten the program before sharing.");
  return `#ns=${token}`;
}
export function restoreShareState(hash: string): ShareState {
  try {
    if (!hash.startsWith("#ns=") || hash.length > MAX_SHARE_LENGTH + 4 || !/^[\w-]+$/.test(hash.slice(4))) return { ...DEFAULT };
    const raw = atob(hash.slice(4).replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decompress(Uint8Array.from(raw, c => c.charCodeAt(0)))));
    if (payload.v !== 1 || payload.example !== undefined && !Object.hasOwn(EXAMPLES, payload.example)) return { ...DEFAULT };
    if (payload.example) payload.source = EXAMPLES[payload.example];
    return validate(payload) ?? { ...DEFAULT };
  } catch { return { ...DEFAULT }; }
}
