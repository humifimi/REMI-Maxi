/**
 * `applyMoveChainBorderOverride` unit tests
 * (PR-UX-2 PASS 2.12, 2026-05-05).
 *
 * The user reported that on a 6-step cascade chain ("Seed cascade
 * chain (6-step)" in the dev seed harness — see
 * `app/pending-reality/review.tsx`'s `makeDevCascadeChain`), the
 * source cards for steps 0..4 were getting their per-step
 * `TECH_PALETTE`-indexed chain border but the LAST source card
 * (step 5) was rendering with no chain border at all. This suite
 * locks in that every step ordinal in a chain — including the
 * terminator step — gets the `highlight()` style when its ordinal
 * is in the spotlight set.
 *
 * The shape mirrors `makeDevCascadeChain`:
 *   - sources[0..4] are reschedules whose destination overlaps the
 *     next source's current slot (each step displaces the next
 *     card in the sequence).
 *   - sources[5] is the terminator: a reschedule whose destination
 *     is an empty early-morning slot (07:00–08:00) on the same
 *     tech and date as sources[5]. The terminator has no outgoing
 *     edge in the chain graph, so its source card is the LAST
 *     entry in `chain.intentIds`.
 *
 * If the bug regressed, step 5's assertion fails because
 * `applyMoveChainBorderOverride` either:
 *   1. doesn't find the terminator intent in `chain.intentIds` (off-
 *      by-one in the chain walker), or
 *   2. receives a stale spotlight set that excludes step 5, or
 *   3. takes a `dimOrExempt` branch that suppresses the highlight
 *      for the terminator specifically.
 */

import type { Event as RCEvent, StyleOverrides } from "react-native-resource-calendar";

import { TECH_PALETTE } from "@technician/constants/colors";
import { applyMoveChainBorderOverride } from "@technician/components/calendar/move-chain-overlay-style";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import { makeIntent } from "@technician/stores/__fixtures__/pending-reality";
import {
  detectMoveChains,
  getVisibleMoveChainDestSlots,
} from "@technician/utils/detect-move-chains";

const DATE = "2026-05-05";
const TECH_ID = 7;

function makeAppt(
  id: number,
  start: string,
  end: string,
): LinterAppointment {
  return {
    id,
    customer_id: 9000 + id,
    technician_id: TECH_ID,
    franchise_id: 1,
    fleet_company_id: null,
    status: "scheduled",
    scheduled_date: DATE,
    scheduled_start_time: start,
    scheduled_end_time: end,
    recurrence_series_id: null,
  };
}

function reschedule(
  intentId: number,
  appointmentId: number,
  start: string,
  end: string,
): ReorganizationIntent {
  return makeIntent(intentId, {
    appointment_id: appointmentId,
    payload: {
      kind: "reschedule",
      new_scheduled_date: DATE,
      new_start_time: start,
      new_end_time: end,
      new_technician_id: TECH_ID,
    },
  });
}

/**
 * Build a fake `RCEvent` whose `meta.appointment.id` matches the
 * given appointment id. The override pulls the appointment via
 * `getAppointmentFromEvent(event)` — so the meta shape MUST line
 * up with `event.meta.appointment.id`.
 */
function makeEventForAppt(appt: LinterAppointment): RCEvent {
  return {
    id: appt.id,
    resourceId: appt.technician_id ?? TECH_ID,
    date: appt.scheduled_date,
    from: 9 * 60,
    to: 10 * 60,
    title: `appt-${appt.id}`,
    meta: {
      appointment: {
        id: appt.id,
        technician_id: appt.technician_id,
        scheduled_date: appt.scheduled_date,
        scheduled_time: appt.scheduled_start_time,
        scheduled_end_time: appt.scheduled_end_time,
      },
    },
  } as unknown as RCEvent;
}

/**
 * Read the resolved `borderColor` off the override's StyleOverrides
 * return. `undefined` means the override returned `base` (no chain
 * border). Used to assert the highlight branch fired.
 */
function borderColorFromResult(result: StyleOverrides | undefined): string | undefined {
  if (!result) return undefined;
  const container = result.container as { borderColor?: string } | undefined;
  return container?.borderColor;
}

describe("applyMoveChainBorderOverride — 6-step cascade", () => {
  // Build the 6-step seed shape from `makeDevCascadeChain`. Slots
  // chosen so each step's destination overlaps exactly the next
  // step's source slot (linear cascade, no splits).
  const sources = [
    makeAppt(101, "09:00", "10:00"),
    makeAppt(102, "10:00", "11:00"),
    makeAppt(103, "11:00", "12:00"),
    makeAppt(104, "12:00", "13:00"),
    makeAppt(105, "13:00", "14:00"),
    makeAppt(106, "14:00", "15:00"),
  ];
  // sources[i] is rescheduled INTO sources[i+1]'s current slot for
  // i in 0..4. The last intent is the terminator: it moves
  // sources[5] from 14:00–15:00 to the empty 07:00–08:00 slot.
  const intents: ReorganizationIntent[] = [
    reschedule(99200, 101, "10:00", "11:00"), // → sources[1]'s slot
    reschedule(99201, 102, "11:00", "12:00"), // → sources[2]'s slot
    reschedule(99202, 103, "12:00", "13:00"), // → sources[3]'s slot
    reschedule(99203, 104, "13:00", "14:00"), // → sources[4]'s slot
    reschedule(99204, 105, "14:00", "15:00"), // → sources[5]'s slot
    reschedule(99205, 106, "07:00", "08:00"), // terminator → empty
  ];

  const graph = detectMoveChains(intents, sources);
  const chainId = graph.chains[0]?.id ?? "chain-?";

  it("groups all 6 intents into one linear chain (sanity)", () => {
    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0].intentIds).toEqual([
      99200, 99201, 99202, 99203, 99204, 99205,
    ]);
    expect(graph.chains[0].stepColors).toEqual([
      TECH_PALETTE[0],
      TECH_PALETTE[1],
      TECH_PALETTE[2],
      TECH_PALETTE[3],
      TECH_PALETTE[4],
      TECH_PALETTE[5],
    ]);
  });

  // The user's bug report screenshot showed steps 0..4 outlined
  // and step 5 (Sophia Patel, the LAST source in the cascade) with
  // no chain border. Without a spotlight set (`undefined`) every
  // step should outline.
  it("renders every step's source card with its TECH_PALETTE step color (no spotlight set)", () => {
    for (let i = 0; i < sources.length; i += 1) {
      const event = makeEventForAppt(sources[i]);
      const result = applyMoveChainBorderOverride(event, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        // chainStepHighlights left undefined → pre-c8 behavior:
        // every chain member outlines.
      });
      const color = borderColorFromResult(result);
      expect(color).toBe(TECH_PALETTE[i]);
    }
  });

  it("renders every step's source card when the spotlight set is the full prefix [0..5]", () => {
    const fullPrefix = [0, 1, 2, 3, 4, 5];
    for (let i = 0; i < sources.length; i += 1) {
      const event = makeEventForAppt(sources[i]);
      const result = applyMoveChainBorderOverride(event, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        chainStepHighlights: fullPrefix,
      });
      const color = borderColorFromResult(result);
      // Step `i` MUST get its palette color — including i === 5
      // (the terminator). This is the regression assertion: if the
      // override ever excludes the last step, this loop fails on
      // the last iteration with `expected "<purple>", got undefined`.
      expect(color).toBe(TECH_PALETTE[i]);
    }
  });

  // PR-UX-2 PASS 2.13 (2026-05-05): regression guard for the
  // "terminator overlaps seed source → cycle → orphaned card has no
  // chain border" symptom. See `detect-move-chains.test.ts` →
  // "emits ZERO chains when the terminator destination overlaps the
  // seed's source slot" for the detector-level documentation of why
  // this happens.
  //
  // Recreates the on-device repro:
  //   - 3 source appts (06:55, 08:25, 10:30) on one tech, one date.
  //   - intent[0] → intent[1]'s slot, intent[1] → intent[2]'s slot.
  //   - intent[2] terminator destination (07:00–08:00) overlaps
  //     intent[0]'s source (06:55–07:25). Cycle 0→1→2→0 forms.
  //
  // The detector returns ZERO chains. Even with a chip selection
  // active and the spotlight set populated, EVERY source card
  // resolves through the no-chain branches and renders without a
  // chain border. The new "ordinal-missing" log + the
  // `detectMoveChains` cycle test pin the upstream cause; this test
  // pins the downstream visual contract so a future "let's render
  // a partial chain for cycles" regression in the detector breaks
  // here loudly.
  describe("terminator-overlap cycle (PR-UX-2 PASS 2.13)", () => {
    const apptA = makeAppt(201, "06:55", "07:25");
    const apptB = makeAppt(202, "08:25", "08:55");
    const apptC = makeAppt(203, "10:30", "11:00");
    const cycleIntents: ReorganizationIntent[] = [
      reschedule(99300, 201, "08:25", "08:55"),
      reschedule(99301, 202, "10:30", "11:00"),
      reschedule(99302, 203, "07:00", "08:00"), // terminator overlaps apptA
    ];
    const cycleGraph = detectMoveChains(cycleIntents, [apptA, apptB, apptC]);

    it("the detector emits ZERO chains for the cycle (sanity)", () => {
      expect(cycleGraph.chains).toEqual([]);
    });

    it("renders every source card WITHOUT a chain border, even with a non-null chain selection", () => {
      // The chip wouldn't render in this state (graph.chains is
      // empty so MoveChainChipRow returns null), but if a stale
      // selectedChainId persisted we still must not paint the
      // wrong border. The override returns `base` early when
      // `graph.chains.length === 0`.
      for (const appt of [apptA, apptB, apptC]) {
        const event = makeEventForAppt(appt);
        const result = applyMoveChainBorderOverride(event, undefined, {
          graph: cycleGraph,
          selectedChainId: "chain-99300", // stale (no longer exists)
          localIntents: cycleIntents,
          chainStepHighlights: [0, 1, 2],
        });
        expect(borderColorFromResult(result)).toBeUndefined();
      }
    });
  });

  it("dims source cards whose step ordinal is NOT in the spotlight set", () => {
    // Spotlight only step 5: every other source card should return
    // base (no chain border) so the user only sees the last card
    // popped. The terminator (step 5) DOES outline.
    const terminatorOnly = [5];
    for (let i = 0; i < sources.length; i += 1) {
      const event = makeEventForAppt(sources[i]);
      const result = applyMoveChainBorderOverride(event, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        chainStepHighlights: terminatorOnly,
      });
      const color = borderColorFromResult(result);
      if (i === 5) {
        expect(color).toBe(TECH_PALETTE[5]);
      } else {
        expect(color).toBeUndefined();
      }
    }
  });

  // PR-UX-2 PASS 2.21 (2026-05-05): regression suite for the user's
  // bug report — "the last card in any sequence, even just 3 cards,
  // STILL doesn't have its colored border! It's when I use the dot
  // bar at the top to select a specific amount of cards to highlight."
  //
  // The full-prefix `[0..5]` case was already locked in above. The
  // bug is specifically the SUBSET-selected case: when the user taps
  // the dot strip to set `chainStepHighlights` to a strict prefix
  // (`[0]`, `[0,1]`, `[0,1,2]`) or to a non-prefix subset (`[3,4]`,
  // `[5]`), the LAST entry in the array must always render its
  // step-color border. Each subset shape below asserts that every
  // ordinal IN the array gets its TECH_PALETTE[ordinal] border AND
  // every ordinal NOT in the array gets no chain border.
  describe("applies highlight border to the LAST step of a subset prefix selection", () => {
    const subsetShapes: { name: string; subset: number[] }[] = [
      { name: "[0] — single first dot", subset: [0] },
      { name: "[0, 1] — two-step prefix", subset: [0, 1] },
      { name: "[0, 1, 2] — three-step prefix", subset: [0, 1, 2] },
      { name: "[3, 4] — non-prefix pair in the middle", subset: [3, 4] },
      { name: "[5] — last dot only (single)", subset: [5] },
    ];

    for (const { name, subset } of subsetShapes) {
      it(`subset ${name}: every ordinal in the set gets its step color, others get no border`, () => {
        const subsetSet = new Set(subset);
        for (let i = 0; i < sources.length; i += 1) {
          const event = makeEventForAppt(sources[i]);
          const result = applyMoveChainBorderOverride(event, undefined, {
            graph,
            selectedChainId: chainId,
            localIntents: intents,
            chainStepHighlights: subset,
          });
          const color = borderColorFromResult(result);
          if (subsetSet.has(i)) {
            // The regression: the LAST element of the subset array
            // (== max(subset)) must always get its step color, not
            // undefined. Looping over every ordinal ensures the
            // assertion fires on the offending one regardless of
            // where in the chain it sits.
            expect(color).toBe(TECH_PALETTE[i]);
          } else {
            expect(color).toBeUndefined();
          }
        }
      });
    }
  });

  // PR-UX-2 PASS 2.22 (2026-05-05): regression suite for the user's
  // bug report — "the last card in any sequence still doesn't have
  // its colored border. It's the card sitting on top of the last
  // ghost card in a sequence."
  //
  // The resolver-side suite above proves the source border IS
  // emitted for cards whose ordinal is in the highlighted set. The
  // user's clarification is that they were pointing at a DIFFERENT
  // card — the one that is the visual destination of the last
  // highlighted arrow, i.e. the source card whose rect overlaps the
  // last visible ghost. For `[0..3]` on a 6-step cascade, that's
  // source ordinal 4 (e.g. appointment 42821): NOT highlighted,
  // hits the spotlight-OUT branch, returns `base` unchanged →
  // tech-color border. The user perceives "this card has no chain
  // color" because the overlaid ghost frame doesn't read as a real
  // card border to them.
  //
  // Mid-pass color correction (2026-05-05): the user's mental model
  // is "every source card has a permanent color identity. When
  // visible because a ghost lands on it, it glows in ITS color,
  // not the ghost's." So the C-rule paints `chain.stepColors[
  // stepOrdinal]` (the card's OWN color), NOT the overlapping
  // ghost's `step_color`. Two-cards-plus-one-ghost-in-the-same-
  // color (which the first cut at this fix produced) collapses the
  // per-step identity and breaks the
  // `2026-05-05-per-step-coloring` deviation's contract.
  //
  // Same-chain restriction: cross-chain overlaps still fall through
  // to the existing `dimOrExempt` exemption (Canvas Decision 1 /
  // Purple-split case).
  describe("spotlight-OUT card under a highlighted ghost glows in its OWN color (PR-UX-2 PASS 2.22)", () => {
    // Sanity: the chain construction we built at the top of this
    // file places ghost(intent K)'s destRect EXACTLY at the rect
    // of source(K+1). Verify upstream geometry before asserting
    // resolver behavior so a future detector change that breaks
    // this assumption fails here loudly with a clear message
    // rather than as a confusing color mismatch downstream.
    it("verifies geometry: ghost(K)'s destRect == source(K+1)'s rect for K in 0..4", () => {
      const slots = getVisibleMoveChainDestSlots(
        graph,
        intents,
        sources,
        chainId,
        [0, 1, 2, 3, 4],
      );
      const slotsByIntentId = new Map(slots.map((s) => [s.intent_id, s]));
      for (let k = 0; k < 5; k += 1) {
        const intentK = graph.chains[0].intentIds[k];
        const slot = slotsByIntentId.get(intentK);
        expect(slot).toBeDefined();
        const next = sources[k + 1];
        expect(slot!.technician_id).toBe(next.technician_id);
        expect(slot!.date).toBe(next.scheduled_date);
        expect(`${String(Math.floor(slot!.startMin / 60)).padStart(2, "0")}:${String(slot!.startMin % 60).padStart(2, "0")}`).toBe(
          next.scheduled_start_time,
        );
        expect(`${String(Math.floor(slot!.endMin / 60)).padStart(2, "0")}:${String(slot!.endMin % 60).padStart(2, "0")}`).toBe(
          next.scheduled_end_time,
        );
      }
    });

    // The exact user repro: highlight [0..3] on the 6-step cascade.
    //   - Sources 101..104 (ordinals 0..3) are highlighted → each
    //     gets its own TECH_PALETTE step color via the existing
    //     highlight() branch.
    //   - Source 105 (ordinal 4) is NOT highlighted but overlaps
    //     ghost(intent 99203, ordinal 3). The C-rule paints it
    //     with its OWN ordinal color = TECH_PALETTE[4], NOT the
    //     ghost's color (TECH_PALETTE[3]).
    //   - Source 106 (ordinal 5) is NOT highlighted and has no
    //     overlapping highlighted ghost (ghost(99204) is for
    //     ordinal 4 which is not in [0..3]; ghost(99205) is the
    //     terminator at the empty 07:00–08:00 slot). So source
    //     106 returns base — no chain border.
    it("source(i+1) under ghost(i) gets its OWN ordinal color when i is highlighted but i+1 is not", () => {
      const subset = [0, 1, 2, 3];
      // Highlighted-set sources: own step color.
      for (const i of subset) {
        const event = makeEventForAppt(sources[i]);
        const result = applyMoveChainBorderOverride(event, undefined, {
          graph,
          selectedChainId: chainId,
          localIntents: intents,
          visibleDestSlots: getVisibleMoveChainDestSlots(
            graph,
            intents,
            sources,
            chainId,
            subset,
          ),
          chainStepHighlights: subset,
        });
        expect(borderColorFromResult(result)).toBe(TECH_PALETTE[i]);
      }

      // Source 105 (ordinal 4): NOT in [0..3] but overlapped by
      // ghost(intent 99203, ordinal 3) → C-rule paints with
      // source's OWN ordinal color = TECH_PALETTE[4]. The whole
      // regression: pre-2.22 returned undefined (base, tech-color
      // border). The first-cut PASS 2.22 returned TECH_PALETTE[3]
      // (ghost color — wrong, would produce 2 cards + 1 ghost in
      // the same color). Final-cut PASS 2.22 returns
      // TECH_PALETTE[4] (own color — preserves per-step identity).
      const eventOrd4 = makeEventForAppt(sources[4]);
      const resultOrd4 = applyMoveChainBorderOverride(eventOrd4, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        visibleDestSlots: getVisibleMoveChainDestSlots(
          graph,
          intents,
          sources,
          chainId,
          subset,
        ),
        chainStepHighlights: subset,
      });
      expect(borderColorFromResult(resultOrd4)).toBe(TECH_PALETTE[4]);
      // Belt-and-suspenders: explicitly assert the WRONG answer
      // (ghost's color) is NOT what we returned. If a future
      // refactor reverses the lookup, this fails immediately
      // with a clear "expected palette[4], got palette[3]"
      // diagnostic instead of a generic resolver mismatch.
      expect(borderColorFromResult(resultOrd4)).not.toBe(TECH_PALETTE[3]);

      // Source 106 (ordinal 5): NOT in [0..3] AND no overlapping
      // highlighted ghost. Returns base → no chain border. Locks
      // in that the C-rule only fires for actual overlaps; an
      // unrelated spotlight-out card stays untouched.
      const eventOrd5 = makeEventForAppt(sources[5]);
      const resultOrd5 = applyMoveChainBorderOverride(eventOrd5, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        visibleDestSlots: getVisibleMoveChainDestSlots(
          graph,
          intents,
          sources,
          chainId,
          subset,
        ),
        chainStepHighlights: subset,
      });
      expect(borderColorFromResult(resultOrd5)).toBeUndefined();
    });

    // Smaller subsets: cover [0], [0,1], [0,1,2], [3,4], [5] —
    // mirroring the resolver-side subset shapes test above. Each
    // spotlight-out card whose rect overlaps a highlighted ghost
    // glows in its OWN ordinal color (not the ghost's).
    const cRuleSubsetShapes: { name: string; subset: number[]; expectedGlows: { ordinal: number; color: string }[] }[] = [
      // [0] highlights ghost(0); ghost(0) lands at source[1]'s
      // rect → source[1] glows in palette[1] (its own color).
      { name: "[0]", subset: [0], expectedGlows: [{ ordinal: 1, color: TECH_PALETTE[1] }] },
      // [0,1] highlights ghosts(0,1); ghost(0)→source[1],
      // ghost(1)→source[2]. source[1] is highlighted → own
      // palette[1] via highlight() branch. source[2] spotlight-out
      // but overlapped by ghost(1) → own palette[2] via C-rule.
      { name: "[0, 1]", subset: [0, 1], expectedGlows: [{ ordinal: 2, color: TECH_PALETTE[2] }] },
      // [0,1,2] → ghosts 0,1,2 active. source[3] spotlight-out,
      // overlapped by ghost(2) → palette[3] (own color).
      { name: "[0, 1, 2]", subset: [0, 1, 2], expectedGlows: [{ ordinal: 3, color: TECH_PALETTE[3] }] },
      // [3, 4] → ghosts 3,4 active. ghost(3)→source[4],
      // ghost(4)→source[5]. source[4] IS in the highlight set so
      // it gets its own palette[4] via highlight() (the C-rule
      // never fires on a highlighted card). source[5] is
      // spotlight-out and overlapped by ghost(4) → palette[5]
      // (its own color) via the C-rule.
      { name: "[3, 4]", subset: [3, 4], expectedGlows: [
        { ordinal: 5, color: TECH_PALETTE[5] },
      ] },
      // [5] → ghost(5) lands at the empty terminator slot, doesn't
      // overlap any source rect. No spotlight-out card glows.
      { name: "[5]", subset: [5], expectedGlows: [] },
    ];

    for (const { name, subset, expectedGlows } of cRuleSubsetShapes) {
      it(`subset ${name}: spotlight-out cards under highlighted ghosts glow in their OWN color`, () => {
        const subsetSet = new Set(subset);
        const visible = getVisibleMoveChainDestSlots(
          graph,
          intents,
          sources,
          chainId,
          subset,
        );
        for (let i = 0; i < sources.length; i += 1) {
          const event = makeEventForAppt(sources[i]);
          const result = applyMoveChainBorderOverride(event, undefined, {
            graph,
            selectedChainId: chainId,
            localIntents: intents,
            visibleDestSlots: visible,
            chainStepHighlights: subset,
          });
          const color = borderColorFromResult(result);
          if (subsetSet.has(i)) {
            // Highlighted ordinal: own palette color via
            // highlight() branch.
            expect(color).toBe(TECH_PALETTE[i]);
          } else {
            const glow = expectedGlows.find((g) => g.ordinal === i);
            if (glow) {
              // C-rule fires: own palette color.
              expect(color).toBe(glow.color);
              // The expected glow IS palette[i] for every entry
              // in the array (the rule paints OWN color). This
              // assertion locks in that property structurally —
              // if a future refactor changes the lookup back to
              // ghost color, the table-of-truth above would still
              // need updating to match, and this assertion fails
              // independently.
              expect(glow.color).toBe(TECH_PALETTE[i]);
            } else {
              expect(color).toBeUndefined();
            }
          }
        }
      });
    }

    // Edge case explicitly called out in the user's clarification:
    // when highlightedSet is `[0..N-1]` (the full prefix), there is
    // no spotlight-OUT successor for the C-rule to fire on, because
    // every ordinal is already in the set. This test asserts the
    // resolver doesn't accidentally paint anything in the C-rule
    // branch in that case (every card hits highlight() with its
    // own color BEFORE reaching the C-rule check). Locks in the
    // "C-rule only fires when there IS a successor source" sub-
    // contract.
    it("full-prefix [0..N-1] never reaches the C-rule branch (every ordinal is already highlighted)", () => {
      const subset = [0, 1, 2, 3, 4, 5];
      const visible = getVisibleMoveChainDestSlots(
        graph,
        intents,
        sources,
        chainId,
        subset,
      );
      for (let i = 0; i < sources.length; i += 1) {
        const event = makeEventForAppt(sources[i]);
        const result = applyMoveChainBorderOverride(event, undefined, {
          graph,
          selectedChainId: chainId,
          localIntents: intents,
          visibleDestSlots: visible,
          chainStepHighlights: subset,
        });
        // Every card highlights via its OWN ordinal — no fall-
        // through to the C-rule possible here.
        expect(borderColorFromResult(result)).toBe(TECH_PALETTE[i]);
      }
    });

    // Multi-overlap edge case: if a card's rect coincides with
    // MULTIPLE highlighted ghosts (e.g. a non-linear chain where
    // ghost(2) and ghost(3) both land on source(4)'s rect), the
    // C-rule still paints the source with its OWN ordinal color.
    // The rule is about the SOURCE's identity, not the ghost's,
    // so the answer is the same regardless of how many ghosts
    // overlap. We synthesize this by passing a fake `visibleDestSlots`
    // with two overlapping entries.
    it("multi-overlap: card under two highlighted ghosts still glows in OWN color", () => {
      const startMin = parseInt(sources[4].scheduled_start_time.slice(0, 2), 10) * 60 +
        parseInt(sources[4].scheduled_start_time.slice(3, 5), 10);
      const endMin = parseInt(sources[4].scheduled_end_time.slice(0, 2), 10) * 60 +
        parseInt(sources[4].scheduled_end_time.slice(3, 5), 10);
      // Two synthetic slots from the SAME chain, both landing at
      // source[4]'s rect. Different `step_color` values to verify
      // the resolver picks NEITHER of them.
      const overlap1 = {
        intent_id: 99202, // a real chain intent so chain_id matches
        chain_id: chainId,
        step_color: TECH_PALETTE[2], // intent 2's color
        appointment_id: sources[4].id,
        technician_id: TECH_ID,
        date: DATE,
        startMin,
        endMin,
      };
      const overlap2 = {
        intent_id: 99203,
        chain_id: chainId,
        step_color: TECH_PALETTE[3],
        appointment_id: sources[4].id,
        technician_id: TECH_ID,
        date: DATE,
        startMin,
        endMin,
      };
      const event = makeEventForAppt(sources[4]);
      const result = applyMoveChainBorderOverride(event, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        visibleDestSlots: [overlap1, overlap2],
        chainStepHighlights: [2, 3], // 4 not highlighted
      });
      expect(borderColorFromResult(result)).toBe(TECH_PALETTE[4]);
    });

    it("the C-rule does NOT fire when a different-chain ghost overlaps the card (Purple-split exemption preserved)", () => {
      // Build a second, independent chain on a different tech and
      // construct a fake `visibleDestSlots` whose only entry is
      // for that other chain. A card belonging to the original
      // 6-step chain whose rect happens to coincide with that
      // foreign ghost MUST NOT pick up the foreign chain's color.
      // It hits the same-chain check `overlappingGhost.chain_id ===
      // chain.id` and falls through to the original spotlight-dim
      // base return.
      const foreignSlot = {
        intent_id: 88888,
        chain_id: "chain-foreign",
        step_color: "#FF00FF", // unmistakable magenta
        appointment_id: sources[4].id,
        technician_id: TECH_ID,
        date: DATE,
        startMin: parseInt(sources[4].scheduled_start_time.slice(0, 2), 10) * 60 +
          parseInt(sources[4].scheduled_start_time.slice(3, 5), 10),
        endMin: parseInt(sources[4].scheduled_end_time.slice(0, 2), 10) * 60 +
          parseInt(sources[4].scheduled_end_time.slice(3, 5), 10),
      } as const;

      const event = makeEventForAppt(sources[4]);
      const result = applyMoveChainBorderOverride(event, undefined, {
        graph,
        selectedChainId: chainId,
        localIntents: intents,
        visibleDestSlots: [foreignSlot],
        chainStepHighlights: [0, 1, 2, 3],
      });
      expect(borderColorFromResult(result)).toBeUndefined();
    });
  });
});
