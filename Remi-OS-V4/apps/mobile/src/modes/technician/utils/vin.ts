/** ISO 3779 VIN helpers — mirrors REMIBackend ocr.service.ts logic. */

export const VIN_LENGTH = 17;
export const VIN_VALID_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const VIN_MISREAD_MAP: Record<string, string> = { I: "1", O: "0", Q: "9" };

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

/** Common OCR / barcode misreads at a single position (VIN charset only). */
const VIN_SINGLE_CHAR_ALTERNATIVES: Record<string, readonly string[]> = {
  "0": ["0", "D"],
  "1": ["1"],
  "2": ["2", "Z"],
  "5": ["5", "S"],
  "6": ["6", "G"],
  "8": ["8", "B"],
  B: ["B", "8"],
  D: ["D", "0"],
  G: ["G", "6"],
  S: ["S", "5"],
  Z: ["Z", "2"],
};

export function normalizeVinText(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .map((ch) => VIN_MISREAD_MAP[ch] ?? ch)
    .join("")
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
}

export function validateVinCheckDigit(vin: string): boolean {
  if (vin.length !== VIN_LENGTH || !VIN_VALID_RE.test(vin)) return false;

  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i++) {
    const ch = vin[i];
    const value = VIN_TRANSLITERATION[ch] ?? parseInt(ch, 10);
    if (Number.isNaN(value)) return false;
    sum += value * VIN_WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected;
}

/** Try one-character OCR fixes when the 17-char candidate fails check digit. */
export function tryRepairVinCheckDigit(vin: string): string | null {
  if (vin.length !== VIN_LENGTH || !VIN_VALID_RE.test(vin)) return null;
  if (validateVinCheckDigit(vin)) return vin;

  for (let i = 0; i < VIN_LENGTH; i++) {
    const alts = VIN_SINGLE_CHAR_ALTERNATIVES[vin[i]] ?? [vin[i]];
    for (const alt of alts) {
      if (alt === vin[i]) continue;
      const candidate = `${vin.slice(0, i)}${alt}${vin.slice(i + 1)}`;
      if (VIN_VALID_RE.test(candidate) && validateVinCheckDigit(candidate)) {
        console.log("[vin] repaired check digit", {
          from: vin,
          to: candidate,
          index: i,
          was: vin[i],
          now: alt,
        });
        return candidate;
      }
    }
  }

  return null;
}

function collectVinCandidates(normalized: string): string[] {
  const out: string[] = [];
  if (normalized.length === VIN_LENGTH && VIN_VALID_RE.test(normalized)) {
    out.push(normalized);
  }
  if (normalized.length >= VIN_LENGTH) {
    for (let i = 0; i <= normalized.length - VIN_LENGTH; i++) {
      const sub = normalized.substring(i, i + VIN_LENGTH);
      if (VIN_VALID_RE.test(sub)) out.push(sub);
    }
  }
  return [...new Set(out)];
}

/**
 * Best-effort VIN from barcode or OCR text.
 * Prefers check-digit-valid reads; attempts single-char repair on near misses.
 * Returns null when nothing trustworthy — caller should fall back to backend OCR.
 */
export function extractBestVin(raw: string): string | null {
  const normalized = normalizeVinText(raw.replace(/\s+/g, ""));
  const candidates = collectVinCandidates(normalized);

  for (const candidate of candidates) {
    if (validateVinCheckDigit(candidate)) {
      console.log("[vin] accepted check-digit-valid read", {
        vin: candidate,
        rawPreview: raw.slice(0, 48),
      });
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const repaired = tryRepairVinCheckDigit(candidate);
    if (repaired) return repaired;
  }

  if (normalized.length >= 14) {
    console.log("[vin] no valid candidate", {
      rawPreview: raw.slice(0, 64),
      normalizedPreview: normalized.slice(0, 24),
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 3),
      preview: previewVinFromText(raw),
    });
  }

  return null;
}

/** Loose preview for failure UI — never auto-submit this. */
export function previewVinFromText(raw: string): string | null {
  const normalized = normalizeVinText(raw.replace(/\s+/g, ""));
  if (normalized.length >= VIN_LENGTH) {
    return normalized.substring(0, VIN_LENGTH);
  }
  return normalized.length >= 14 ? normalized : null;
}
