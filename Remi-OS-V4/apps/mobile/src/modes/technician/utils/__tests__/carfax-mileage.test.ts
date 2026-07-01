import {
  getCarfaxPrefillMileage,
  parseManualMileageInput,
  parseOdometerString,
} from "../carfax-mileage";

describe("parseOdometerString", () => {
  it("parses comma-separated odometer values", () => {
    expect(parseOdometerString("45,320")).toBe(45320);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseOdometerString("")).toBeNull();
    expect(parseOdometerString("abc")).toBeNull();
  });
});

describe("getCarfaxPrefillMileage", () => {
  it("prefers the latest display record odometer", () => {
    const mileage = getCarfaxPrefillMileage({
      errorMessages: {},
      serviceHistory: {
        displayRecords: [{ odometer: "52,100" }, { odometer: "48,000" }],
      },
    });
    expect(mileage).toBe(52100);
  });

  it("falls back to the highest odometer when the first record has none", () => {
    const mileage = getCarfaxPrefillMileage({
      errorMessages: {},
      serviceHistory: {
        displayRecords: [{ odometer: undefined }, { odometer: "41,500" }],
        serviceCategories: [{ serviceName: "Oil", odometerOfLastService: "43,000" }],
      },
    });
    expect(mileage).toBe(43000);
  });
});

describe("parseManualMileageInput", () => {
  it("returns undefined for blank input", () => {
    expect(parseManualMileageInput("")).toBeUndefined();
  });

  it("returns a positive integer mileage", () => {
    expect(parseManualMileageInput("12345")).toBe(12345);
  });
});
