import {
  extractBestVin,
  normalizeVinText,
  previewVinFromText,
  validateVinCheckDigit,
} from "@technician/utils/vin";

describe("vin utils", () => {
  // Honda example VIN with valid check digit (position 9 = J).
  const VALID_VIN = "1HGBH41JXMN109186";

  it("extractBestVin accepts a clean 17-char read", () => {
    expect(extractBestVin(VALID_VIN)).toBe(VALID_VIN);
  });

  it("extractBestVin slides a window when barcode framing adds prefix/suffix", () => {
    expect(extractBestVin(`*${VALID_VIN}*`)).toBe(VALID_VIN);
    expect(extractBestVin(`>8>${VALID_VIN}`)).toBe(VALID_VIN);
  });

  it("tryRepairVinCheckDigit fixes a common 8/B OCR swap", () => {
    const corrupted = `${VALID_VIN.slice(0, 15)}B${VALID_VIN.slice(16)}`;
    expect(validateVinCheckDigit(corrupted)).toBe(false);
    expect(extractBestVin(corrupted)).toBe(VALID_VIN);
  });

  it("returns null for garbage instead of truncating to 17 chars", () => {
    expect(extractBestVin("NOTAVINATALLXXXXX")).toBeNull();
    expect(previewVinFromText("NOTAVINATALLXXXXX")).toBe("N0TAV1NATALLXXXXX");
  });
});
