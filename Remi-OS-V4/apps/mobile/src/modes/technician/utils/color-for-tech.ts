/**
 * Deterministic per-tech color helper (P0-FE-2).
 *
 * Maps a numeric `techId` to a stable color from `TECH_PALETTE` so the
 * same technician always paints the same hue across sessions, devices,
 * and reorders.
 *
 * Consumed by Phase B's overlay-mode coloring (`P2-FE-4`, master plan
 * §5.1.4): when 2+ techs are multi-selected on the franchise calendar
 * the body cards switch from status colors to per-tech colors so the
 * eye can group cards by owner instead of by status.
 *
 * 2026-05-20 — this is now ALSO the color source for the franchise
 * route map (markers, polyline, route-reorder chip bar, reassign
 * picker swatches, bottom legend). Previously the map used a
 * private `ROUTE_PALETTE[routeId % 8]` scheme, which produced
 * map colors that didn't match the calendar's appointment-card
 * colors or the landscape avatar strip's border colors. The user's
 * mental model — each tech has ONE color everywhere — required
 * unifying on `colorForTech(technicianId)`. See
 * `franchise-route-map.tsx`'s `colorForRoute` wrapper.
 *
 * Anything in the app that wants "this tech's color" should call
 * `colorForTech(technicianId)` directly (or one of its wrappers).
 * Do NOT introduce a second hashing/palette scheme.
 *
 * Hash scheme: a Knuth multiplicative hash with the 32-bit Fibonacci
 * constant (2654435761), forced to unsigned via `>>> 0`. Not
 * cryptographic — this just needs to be a stable integer-to-integer
 * scrambler with a roughly uniform distribution over small consecutive
 * inputs (which is what tech IDs almost always are).
 *
 * Bucketing: take the HIGH bits of the hashed value, NOT the low bits.
 * Per Knuth TAOCP §6.4 ("multiplicative hashing"), only the leading
 * bits of `(x * c) mod 2^32` are well-distributed; the trailing bits
 * are degenerate when `c` is odd. We map the unsigned hash uniformly
 * onto `[0, TECH_PALETTE.length)` via `floor((hashed / 2^32) * N)` so
 * the math stays correct if the palette length stops being a power of
 * two (e.g. a future 9-color expansion).
 *
 * HISTORY (fixed 2026-05-08): the original implementation bucketed via
 * `hashed % TECH_PALETTE.length`. With `HASH_MULTIPLIER = 2654435761`
 * (odd) and a power-of-two palette length (8), `% 8` reads the low
 * three bits of the hash, which collapse to `techId mod 8` for any odd
 * multiplier — completely defeating the scramble. A live franchise
 * roster of 6 techs (IDs 2054, 2055, 2056, 2071, 2072, 2073) collided
 * onto only 4 palette slots ("4 techs share 2 colors"). The high-bits
 * variant produces six distinct colors for the same roster. See
 * `src/utils/__tests__/color-for-tech.test.ts` for the regression
 * assertion. Do NOT revert to `hashed % N` — even if the palette grows
 * away from a power of two, the high-bits scheme stays correct and the
 * low-bits scheme stays subtly wrong.
 */

import { TECH_PALETTE } from "@technician/constants/colors";

const HASH_MULTIPLIER = 2654435761;
const HASH_RANGE = 0x1_0000_0000; // 2^32 — `Math.imul(...) >>> 0` upper bound.

export function colorForTech(techId: number): string {
  // Defensive: collapse non-integer / negative / non-finite inputs to a
  // stable bucket so callers can't get `undefined` from this. The map
  // would still return a string for `NaN % N` (it's `NaN`, indexing
  // `palette[NaN]` is undefined), and the calendar consumer expects a
  // string. Floor + abs handles fractional / negative tech IDs.
  const safe =
    Number.isFinite(techId) && Number.isInteger(techId) && techId >= 0
      ? techId
      : Math.abs(Math.floor(Number(techId) || 0));

  const hashed = Math.imul(safe, HASH_MULTIPLIER) >>> 0;
  // Knuth high-bits bucketing (§6.4): map the well-distributed top of
  // the hash uniformly onto the palette index range. Equivalent to
  // `hashed >>> (32 - log2(N))` for power-of-two `N`, but stays
  // correct if the palette length ever stops being a power of two.
  const bucket = Math.floor((hashed / HASH_RANGE) * TECH_PALETTE.length);
  return TECH_PALETTE[bucket];
}
