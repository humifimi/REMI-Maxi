import {
  buildLanesByTechId,
  DEFAULT_TIME_LABEL_WIDTH,
} from "../build-lanes-by-tech-id";

/**
 * Regression tests for the lane-order mismatch that produced
 * "too short / too long / wrong-angle arrows" before
 * 2026-05-12-arrow-lane-order-from-vendor.
 *
 * The vendored Calendar paints mini-cols lanes in `bodyResourceIds`
 * order (= resources-prop order, filtered by selection). The host
 * pre-fix built `lanesByTechId` from `selectedTechIds` (selection
 * order). When the user toggled techs in any order other than
 * resources-prop order, the two arrays diverged and the calculated
 * arrow X coordinates pointed at the wrong sub-lane. Post-fix, the
 * host receives the painted order through `onBodyResourceIdsChange`
 * and feeds it directly into this helper.
 */
describe("buildLanesByTechId", () => {
  const WORKWEEK_DAYS = 4;
  const MEASURED_WIDTH = 1000;

  it("maps each tech to its array-position lane index, not its numerical id", () => {
    // Library paints in this order: [Josh, Jake, Todd, Dan, Shaun, Trey]
    const renderedOrder = [2054, 2055, 2056, 2071, 2072, 2073];
    const result = buildLanesByTechId(
      renderedOrder,
      MEASURED_WIDTH,
      WORKWEEK_DAYS,
    );
    expect(result).toBeDefined();
    expect(result!.get(2054)?.laneIndex).toBe(0);
    expect(result!.get(2055)?.laneIndex).toBe(1);
    expect(result!.get(2056)?.laneIndex).toBe(2);
    expect(result!.get(2071)?.laneIndex).toBe(3);
    expect(result!.get(2072)?.laneIndex).toBe(4);
    expect(result!.get(2073)?.laneIndex).toBe(5);
  });

  it("follows array order even when it disagrees with id order (the regression case)", () => {
    // The 2026-05-12 repro: user tapped Shaun (2072) first, then
    // Josh, Jake, Dan, Trey, Todd in some other order. The library
    // paints in resources-prop order ([2054, 2055, 2056, 2071, 2072, 2073])
    // regardless of which order they toggled. Pre-fix the host built
    // lanes from `selectedTechIds` (selection order), which put
    // Shaun at laneIndex=0 even though the library paints him at 4.
    //
    // The helper must NEVER infer order from id values; it must
    // honor the caller's array ordering exactly.
    const selectionOrder = [2072, 2054, 2055, 2071, 2073, 2056];
    const result = buildLanesByTechId(
      selectionOrder,
      MEASURED_WIDTH,
      WORKWEEK_DAYS,
    );
    expect(result).toBeDefined();
    // Whichever array we pass in, that's the lane order. Caller's
    // responsibility (now: pull from the library callback) to pass
    // the *painted* order, not the selection order.
    expect(result!.get(2072)?.laneIndex).toBe(0);
    expect(result!.get(2054)?.laneIndex).toBe(1);
    expect(result!.get(2055)?.laneIndex).toBe(2);
    expect(result!.get(2071)?.laneIndex).toBe(3);
    expect(result!.get(2073)?.laneIndex).toBe(4);
    expect(result!.get(2056)?.laneIndex).toBe(5);
  });

  it("computes laneWidth as colWidth / techCount", () => {
    const renderedOrder = [10, 20, 30, 40]; // 4 techs
    const result = buildLanesByTechId(
      renderedOrder,
      MEASURED_WIDTH,
      WORKWEEK_DAYS,
    );
    expect(result).toBeDefined();
    // colWidth = (1000 - 50) / 4 = 237.5
    // laneWidth = 237.5 / 4 = 59.375
    const entry = result!.get(10)!;
    expect(entry.laneWidth).toBeCloseTo(59.375, 5);
    // All techs share the same laneWidth (uniform partitioning).
    for (const id of renderedOrder) {
      expect(result!.get(id)?.laneWidth).toBeCloseTo(59.375, 5);
    }
  });

  it("respects a non-default timeLabelWidth", () => {
    const renderedOrder = [10, 20];
    const result = buildLanesByTechId(
      renderedOrder,
      MEASURED_WIDTH,
      WORKWEEK_DAYS,
      100,
    );
    expect(result).toBeDefined();
    // colWidth = (1000 - 100) / 4 = 225
    // laneWidth = 225 / 2 = 112.5
    expect(result!.get(10)?.laneWidth).toBeCloseTo(112.5, 5);
  });

  it("uses DEFAULT_TIME_LABEL_WIDTH when omitted", () => {
    expect(DEFAULT_TIME_LABEL_WIDTH).toBe(50);
    const renderedOrder = [10, 20];
    const withExplicit = buildLanesByTechId(
      renderedOrder,
      MEASURED_WIDTH,
      WORKWEEK_DAYS,
      DEFAULT_TIME_LABEL_WIDTH,
    );
    const withDefault = buildLanesByTechId(
      renderedOrder,
      MEASURED_WIDTH,
      WORKWEEK_DAYS,
    );
    expect(withDefault).toBeDefined();
    expect(withExplicit).toBeDefined();
    expect(withDefault!.get(10)?.laneWidth).toBeCloseTo(
      withExplicit!.get(10)!.laneWidth,
      10,
    );
  });

  describe("short-circuit conditions (= use day-column geometry)", () => {
    it("returns undefined when fewer than 2 lanes", () => {
      expect(buildLanesByTechId([], MEASURED_WIDTH, WORKWEEK_DAYS)).toBeUndefined();
      expect(buildLanesByTechId([42], MEASURED_WIDTH, WORKWEEK_DAYS)).toBeUndefined();
    });

    it("returns undefined when measuredCalendarWidth is zero or negative", () => {
      expect(buildLanesByTechId([10, 20], 0, WORKWEEK_DAYS)).toBeUndefined();
      expect(buildLanesByTechId([10, 20], -100, WORKWEEK_DAYS)).toBeUndefined();
    });

    it("returns undefined when measuredCalendarWidth is non-finite", () => {
      expect(
        buildLanesByTechId([10, 20], Number.NaN, WORKWEEK_DAYS),
      ).toBeUndefined();
      expect(
        buildLanesByTechId([10, 20], Number.POSITIVE_INFINITY, WORKWEEK_DAYS),
      ).toBeUndefined();
    });

    it("returns undefined when daysCount is zero or negative", () => {
      expect(buildLanesByTechId([10, 20], MEASURED_WIDTH, 0)).toBeUndefined();
      expect(buildLanesByTechId([10, 20], MEASURED_WIDTH, -1)).toBeUndefined();
    });

    it("returns undefined when timeLabelWidth >= measuredCalendarWidth", () => {
      // colWidth would be ≤ 0 — refuse rather than emit a negative laneWidth.
      expect(
        buildLanesByTechId([10, 20], 100, WORKWEEK_DAYS, 100),
      ).toBeUndefined();
      expect(
        buildLanesByTechId([10, 20], 80, WORKWEEK_DAYS, 100),
      ).toBeUndefined();
    });
  });

  describe("identity of the result", () => {
    it("uses a Map (not a plain object), so non-numeric keys can't sneak in", () => {
      const result = buildLanesByTechId([1, 2], MEASURED_WIDTH, WORKWEEK_DAYS);
      expect(result).toBeInstanceOf(Map);
    });

    it("preserves duplicate tech ids by keeping the LAST seen lane index", () => {
      // Defensive: a malformed `bodyResourceIds` containing a dup
      // shouldn't crash; Map.set keeps the last assignment. This
      // shape never occurs in practice (the library filters
      // resources by id uniqueness) but failing soft is preferable.
      const result = buildLanesByTechId(
        [10, 20, 10],
        MEASURED_WIDTH,
        WORKWEEK_DAYS,
      );
      expect(result).toBeDefined();
      expect(result!.get(10)?.laneIndex).toBe(2);
      expect(result!.get(20)?.laneIndex).toBe(1);
    });
  });
});
