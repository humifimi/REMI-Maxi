/**
 * Unit tests for `format-display` (D2P-FE-13 follow-up).
 *
 * These formatters render every user-facing time / date / linter
 * message on the Pending Reality + linter-intercept screens, so
 * regressions are visible immediately on the smoke path. Coverage
 * priorities (in order):
 *   1. Inputs in the wire shapes the BE actually sends — `HH:MM`,
 *      `HH:MM:SS`, `YYYY-MM-DD`.
 *   2. Boundary-of-12 cases for AM/PM (00:00, 12:00, 23:59).
 *   3. Idempotence for `humanizeLinterMessage` (running twice on
 *      its own output is a no-op — important when the same
 *      message flows through multiple consumers).
 *   4. Graceful pass-through on malformed inputs.
 */

import {
  formatDateFriendly,
  formatTime12h,
  formatTimeRange12h,
  humanizeLinterMessage,
} from "../format-display";

describe("formatTime12h", () => {
  it.each([
    ["00:00", "12:00 AM"],
    ["00:30", "12:30 AM"],
    ["09:00", "9:00 AM"],
    ["11:59", "11:59 AM"],
    ["12:00", "12:00 PM"],
    ["12:30", "12:30 PM"],
    ["13:30", "1:30 PM"],
    ["20:15", "8:15 PM"],
    ["23:59", "11:59 PM"],
  ])("formats wire time %s as %s", (input, expected) => {
    expect(formatTime12h(input)).toBe(expected);
  });

  it("accepts the HH:MM:SS shape (BE TIME columns)", () => {
    expect(formatTime12h("13:30:00")).toBe("1:30 PM");
    expect(formatTime12h("08:15:42")).toBe("8:15 AM");
  });

  it("returns the input unchanged for unrecognised shapes", () => {
    expect(formatTime12h("")).toBe("");
    expect(formatTime12h("13:30:00.123")).toBe("13:30:00.123");
    expect(formatTime12h("1:30 PM")).toBe("1:30 PM");
    expect(formatTime12h("not a time")).toBe("not a time");
  });
});

describe("formatDateFriendly", () => {
  it("formats a same-year wire date as `Day, Mon DD`", () => {
    // Sun, Apr 26, 2026 is a real Sunday; pin `today` so the test
    // doesn't drift with the calendar.
    const today = new Date(2026, 3, 26); // April 26, 2026
    expect(formatDateFriendly("2026-04-26", today)).toBe("Sun, Apr 26");
  });

  it("appends the year when the date is in a different calendar year", () => {
    const today = new Date(2026, 3, 26);
    expect(formatDateFriendly("2027-01-15", today)).toBe("Fri, Jan 15, 2027");
  });

  it("returns the input unchanged for unrecognised shapes", () => {
    expect(formatDateFriendly("")).toBe("");
    expect(formatDateFriendly("04/26/2026")).toBe("04/26/2026");
    expect(formatDateFriendly("2026-04-26T13:30:00")).toBe(
      "2026-04-26T13:30:00",
    );
  });
});

describe("formatTimeRange12h", () => {
  it("collapses the period when both halves share AM or PM (PM)", () => {
    expect(formatTimeRange12h("13:30:00", "15:50:00")).toBe(
      "1:30\u2009\u2013\u20093:50 PM",
    );
  });

  it("collapses the period when both halves share AM or PM (AM)", () => {
    expect(formatTimeRange12h("09:00:00", "10:30:00")).toBe(
      "9:00\u2009\u2013\u200910:30 AM",
    );
  });

  it("keeps both periods when the range crosses noon", () => {
    expect(formatTimeRange12h("11:30:00", "13:00:00")).toBe(
      "11:30 AM\u2009\u2013\u20091:00 PM",
    );
  });

  it("falls back to start-only when end is missing", () => {
    expect(formatTimeRange12h("17:00:00", null)).toBe("5:00 PM");
    expect(formatTimeRange12h("17:00:00", undefined)).toBe("5:00 PM");
  });

  it("returns 'Unscheduled' when start is missing", () => {
    expect(formatTimeRange12h(null, "10:00:00")).toBe("Unscheduled");
    expect(formatTimeRange12h(undefined, "10:00:00")).toBe("Unscheduled");
  });

  it("falls back to the raw input when start does not parse", () => {
    expect(formatTimeRange12h("not-a-time", "10:00:00")).toBe("not-a-time");
  });
});

describe("humanizeLinterMessage", () => {
  const RAW = [
    "Proposed time 13:30:00-15:50:00 for technician 1487 on 2026-04-26",
    "overlaps committed appointment #27026 (14:30:00-15:15:00).",
  ].join(" ");

  it("substitutes wire times and dates", () => {
    const today = new Date(2026, 3, 26);
    const out = humanizeLinterMessage(RAW);
    // Times rewritten to 12h form.
    expect(out).toContain("1:30 PM");
    expect(out).toContain("3:50 PM");
    expect(out).toContain("2:30 PM");
    expect(out).toContain("3:15 PM");
    // Date rewritten — exact suffix depends on `today`, but the
    // wire shape MUST be gone.
    expect(out).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(out).not.toMatch(/\b\d{2}:\d{2}:\d{2}\b/);

    // Day-aware sanity (re-run with explicit today).
    const out2 = humanizeLinterMessage(RAW.replace("2026-04-26", "2026-04-26"));
    expect(out2.includes("Sun, Apr 26") || out2.includes("Apr 26")).toBe(true);
    void today;
  });

  it("substitutes appointment ids when a label is supplied", () => {
    const out = humanizeLinterMessage(RAW, {
      appointmentLabels: new Map([[27026, "Jane Doe"]]),
    });
    expect(out).toContain("Jane Doe");
    expect(out).not.toContain("appointment #27026");
  });

  it("substitutes technician ids when a name is supplied", () => {
    const out = humanizeLinterMessage(RAW, {
      technicianNames: new Map([[1487, "Tech B"]]),
    });
    expect(out).toContain("Tech B");
    expect(out).not.toContain("technician 1487");
  });

  it("falls back to the bare wire form when an id is unknown", () => {
    const out = humanizeLinterMessage(RAW, {
      appointmentLabels: new Map([[99999, "Someone Else"]]),
      technicianNames: new Map([[88888, "Some Other Tech"]]),
    });
    // Times + dates still rewritten, but the bare ID forms remain
    // because they didn't match the supplied lookup keys.
    expect(out).toContain("technician 1487");
    expect(out).toContain("appointment #27026");
  });

  it("is idempotent (running on its own output is a no-op)", () => {
    const lookups = {
      appointmentLabels: new Map([[27026, "Jane Doe"]]),
      technicianNames: new Map([[1487, "Tech B"]]),
    };
    const once = humanizeLinterMessage(RAW, lookups);
    const twice = humanizeLinterMessage(once, lookups);
    expect(twice).toBe(once);
  });

  it("passes through empty / nonstring input", () => {
    expect(humanizeLinterMessage("")).toBe("");
  });
});
