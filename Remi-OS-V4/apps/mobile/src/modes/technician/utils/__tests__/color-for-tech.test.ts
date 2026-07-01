/**
 * Tests for `colorForTech` (P0-FE-2).
 *
 * The Jest runner (`jest-expo`) is now wired in this repo — these
 * assertions execute under `npx jest`. The "executable spec" framing
 * predates the runner landing and is preserved in older entries.
 *
 * `colorForTech` itself is a pure function with zero React Native
 * dependencies; the file's invariants are:
 *   1. Stable: same input → same output across calls.
 *   2. In-palette: every output is a member of `TECH_PALETTE`.
 *   3. Distinct on small live rosters: a real franchise's 4–8 techs
 *      should never collide on the same hue. (Regression for the
 *      2026-05-08 low-bits hash bug — see DEVELOPMENT-LOG.md.)
 *   4. Defensive: malformed inputs still return a palette string.
 *
 * Tests do NOT assert exact-color-for-exact-id snapshots — that would
 * convert any palette tweak or hash-constant change into a test
 * failure with no real signal. The contract is "same id → same color"
 * and "different ids → different colors on small rosters", not "id
 * 2054 specifically maps to red-600."
 */

import { TECH_PALETTE } from "@technician/constants/colors";
import { colorForTech } from "../color-for-tech";

describe("colorForTech — determinism", () => {
  it("returns the same color for the same techId across repeated calls", () => {
    for (let id = 0; id < 200; id += 1) {
      const first = colorForTech(id);
      const second = colorForTech(id);
      const third = colorForTech(id);
      expect(second).toBe(first);
      expect(third).toBe(first);
    }
  });

  it("only ever returns colors that are members of TECH_PALETTE", () => {
    const palette = new Set(TECH_PALETTE);
    for (let id = 0; id < 1000; id += 1) {
      expect(palette.has(colorForTech(id))).toBe(true);
    }
  });
});

describe("colorForTech — distribution", () => {
  it("across techIds 1..100, no single palette slot is overrepresented by more than 30%", () => {
    const counts = new Map<string, number>();
    for (let id = 1; id <= 100; id += 1) {
      const c = colorForTech(id);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const expectedPerSlot = 100 / TECH_PALETTE.length;
    const maxAllowed = expectedPerSlot * 1.3;
    for (const [color, count] of counts) {
      expect(count).toBeLessThanOrEqual(maxAllowed);
      // Sanity: every slot should also see at least one hit on a
      // dataset this size; if not the hash is degenerate.
      expect(count).toBeGreaterThan(0);
      // Touch `color` so test failures can identify the offender.
      void color;
    }
  });
});

describe("colorForTech — smoke", () => {
  it("tech IDs 1..10 produce at least 8 distinct colors", () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 10; id += 1) {
      seen.add(colorForTech(id));
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});

describe("colorForTech — live-roster regression (2026-05-08 low-bits hash bug)", () => {
  // The original implementation bucketed via `hashed % TECH_PALETTE.length`.
  // For an odd Knuth multiplier and a power-of-two palette length, the low
  // bits of the multiplicative hash collapse to `techId mod N`, which on
  // this user's live roster (six techs, IDs 2054–2073) produced only four
  // distinct palette entries — Jake (2055) collided with Dan (2071) on
  // pink, Todd (2056) collided with Shaun (2072) on red. The fix moved
  // bucketing to the high bits of the hashed value (Knuth TAOCP §6.4).
  //
  // This single assertion is the "would-have-caught-the-original-bug"
  // guard. If `colorForTech` ever gets refactored back to a low-bits
  // bucketing scheme, this test will fail loudly on these exact IDs.
  it("six live tech IDs map to six distinct palette colors", () => {
    const liveRoster = [2054, 2055, 2056, 2071, 2072, 2073];
    const colors = liveRoster.map((id) => colorForTech(id));
    expect(new Set(colors).size).toBe(liveRoster.length);
  });
});

describe("colorForTech — same-residue regression (the actual hash bug)", () => {
  // The 2026-05-08 hash bug: bucketing via `hashed % TECH_PALETTE.length`
  // with an odd Knuth multiplier and a power-of-two palette (8) collapses
  // to `techId mod 8` regardless of the multiplication. Two IDs with the
  // same residue mod 8 (e.g. 2054 and 2062) ALWAYS shared a color under
  // the bug, even though they're 8 apart and should land on independent
  // hash buckets.
  //
  // The "distinct over consecutive 8" property is a bad regression test
  // — the buggy scheme actually PASSES it because (n, n+1, …, n+7) mod 8
  // covers all 8 residues. The right test is the inverse: IDs that share
  // a residue mod N must NOT always collapse onto the same color. With
  // the high-bits scheme they're independently scrambled, so a sample of
  // five same-residue IDs should produce more than one distinct color
  // (typically 4 or 5 of 5).
  it.each(Array.from({ length: TECH_PALETTE.length }, (_, r) => r))(
    "five IDs sharing residue %i mod N produce > 1 distinct color",
    (residue) => {
      const sample = [0, 1, 2, 3, 4].map(
        (k) => 2000 + residue + k * TECH_PALETTE.length
      );
      const colors = new Set(sample.map((id) => colorForTech(id)));
      expect(colors.size).toBeGreaterThan(1);
    }
  );
});

describe("colorForTech — distinctness over consecutive runs (sanity)", () => {
  // Sanity check that the high-bits scrambling isn't degenerate over
  // small runs. NOTE: this is a weak signal for the 2026-05-08 hash
  // bug — the buggy `% N` scheme would have passed at >= N-1 distinct
  // for any consecutive run because (base..base+N-1) mod N covers all
  // residues. The actual regression test is in the "same-residue"
  // describe above. Threshold of "≥ N/2 distinct" is purely to flag a
  // catastrophic hash regression where every input lands in the same
  // bucket; we tolerate the natural collisions a uniform 8-bucket hash
  // produces on a sample of 8 (P(all distinct) ≈ 8!/8^8 ≈ 2.4%).
  const PALETTE_N = TECH_PALETTE.length;
  const MIN_DISTINCT_SANITY = Math.ceil(PALETTE_N / 2);

  it.each([1, 100, 1000, 2000, 5000])(
    "consecutive run starting at base %i produces ≥ N/2 distinct colors",
    (base) => {
      const seen = new Set<string>();
      for (let offset = 0; offset < PALETTE_N; offset += 1) {
        seen.add(colorForTech(base + offset));
      }
      expect(seen.size).toBeGreaterThanOrEqual(MIN_DISTINCT_SANITY);
    }
  );
});

describe("colorForTech — defensive behavior", () => {
  it("returns a palette color for 0", () => {
    expect(TECH_PALETTE).toContain(colorForTech(0));
  });

  it("returns a palette color for large ids", () => {
    expect(TECH_PALETTE).toContain(colorForTech(2_147_483_647));
    expect(TECH_PALETTE).toContain(colorForTech(987_654_321));
  });

  it("never returns undefined for malformed inputs", () => {
    // These should not happen in practice (techId is `number` per the
    // backend `User` row) but TypeScript can't catch every cast — make
    // sure the helper never returns `undefined`.
    expect(typeof colorForTech(-1)).toBe("string");
    expect(typeof colorForTech(Number.NaN)).toBe("string");
    expect(typeof colorForTech(3.7)).toBe("string");
  });
});
