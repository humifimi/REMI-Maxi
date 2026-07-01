/**
 * Logistics linter — fixture-driven tests (P1-BE-4, mirror of REMIBackend
 * `src/services/scheduling/__tests__/logistics-linter.test.ts`).
 *
 * NOTE: this repo does not currently ship a Jest runner (same caveat as
 * P0-FE-1, P0-FE-2, P0-FE-7). Until `jest-expo` lands, this file is
 * excluded from `tsc --noEmit` via the existing `**\/__tests__\/**`
 * entry in `tsconfig.json` and is treated as executable specification.
 *
 * In the meantime, behaviour is verified by
 * `scripts/sanity-check-logistics-linter.ts` — a pure-Node script that
 * loads the same fixtures via the symlink, runs `lintSession`, and
 * deep-compares the produced issues against the JSON expectations. Run
 * it manually with:
 *
 *     npx ts-node --transpile-only scripts/sanity-check-logistics-linter.ts
 *
 * The `__fixtures__/linter-cases` directory in this repo is a symlink
 * to the canonical REMIBackend fixtures dir
 * (`/Users/jacegalloway/Documents/codebases/REMIBackend/src/services/scheduling/__fixtures__/linter-cases`).
 * Identical fixture set produces identical issue arrays in both repos —
 * see `.cursor/rules/logistics-linter.mdc` for the contract.
 */

/* eslint-disable import/no-unresolved */

import * as fs from "node:fs";
import * as path from "node:path";

import { lintSession } from "../logistics-linter";
import type { LinterIssue, LinterWorldSnapshot } from "../logistics-linter";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationSession,
} from "../../types/reorganization";

interface ExpectedIssue {
  severity: "error" | "warning";
  kind: LinterIssue["kind"];
  affectedAppointmentIds: number[];
  humanMessageRegex: string;
  suggestedAutoFix: ReorganizationIntentPayload | null;
}

interface Fixture {
  label: string;
  input: {
    session: unknown;
    intents: unknown;
    world: unknown;
  };
  expected: ExpectedIssue[];
}

const FIXTURE_DIR = path.join(__dirname, "..", "__fixtures__", "linter-cases");

function loadFixtures(): Array<{ name: string; fixture: Fixture }> {
  const files = fs
    .readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((name) => {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
    const fixture = JSON.parse(raw) as Fixture;
    return { name, fixture };
  });
}

describe("lintSession — fixtures", () => {
  const fixtures = loadFixtures();

  it("loads at least the v1 baseline fixture set", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
  });

  for (const { name, fixture } of fixtures) {
    it(`${name} — ${fixture.label}`, () => {
      const session = fixture.input.session as unknown as ReorganizationSession;
      const intents = fixture.input.intents as unknown as ReorganizationIntent[];
      const world = fixture.input.world as unknown as LinterWorldSnapshot;

      const issues = lintSession(session, intents, world);

      expect(issues.length).toBe(fixture.expected.length);

      for (let i = 0; i < fixture.expected.length; i += 1) {
        const actual = issues[i];
        const expected = fixture.expected[i];

        expect(actual.severity).toBe(expected.severity);
        expect(actual.kind).toBe(expected.kind);
        expect(actual.affectedAppointmentIds).toEqual(expected.affectedAppointmentIds);
        expect(actual.humanMessage).toMatch(new RegExp(expected.humanMessageRegex));

        if (expected.suggestedAutoFix === null) {
          expect(actual.suggestedAutoFix).toBeUndefined();
        } else {
          expect(actual.suggestedAutoFix).toEqual(expected.suggestedAutoFix);
        }
      }
    });
  }
});

// ───────────────────────────────────────────────────────────────────
// Cross-repo parity (D2P-FE-13 / Pending Reality demo bundle §4.5.2)
//
// `useCalendarWorldSnapshot` (the FE consumer-side seam) projects a
// day-view response into a `LinterWorldSnapshot`. The contract this
// repo cares about is:
//
//   Given a `LinterWorldSnapshot` shaped identically to a known-good
//   REMIBackend linter fixture, our `lintSession` produces the same
//   `LinterIssue[]` array the BE's `lintSession` produces over the
//   same raw fixture.
//
// The fixtures-driven describe block above already covers identity
// for every fixture in the symlinked corpus — but it's keyed by file
// name and easy to miss when reading. This block re-runs the
// `time-conflict-with-committed.json` fixture under an explicit
// "cross-repo parity" label so it's a discoverable invariant in this
// PR's diff.
// ───────────────────────────────────────────────────────────────────

describe("lintSession — cross-repo parity (D2P-FE-13)", () => {
  it("matches REMIBackend output for the time-conflict-with-committed fixture", () => {
    const file = path.join(FIXTURE_DIR, "time-conflict-with-committed.json");
    const fixture = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;

    const session = fixture.input.session as unknown as ReorganizationSession;
    const intents = fixture.input.intents as unknown as ReorganizationIntent[];
    const world = fixture.input.world as unknown as LinterWorldSnapshot;

    // Project the world snapshot through the same shape
    // `useCalendarWorldSnapshot` produces — appointments-only,
    // routes/customerSlas/fleet stubbed empty — to confirm the FE's
    // v1 surface still produces the canonical issue against the
    // appointments half of the fixture (the only half the FE
    // assembles today; R3/R4/R9/R10 ride on the other halves and
    // light up automatically once their caches ship).
    const feShapedWorld: LinterWorldSnapshot = {
      appointments: world.appointments,
      routes: [],
      customerSlas: [],
      fleet: { accounts: [] },
    };

    const issues = lintSession(session, intents, feShapedWorld);

    expect(issues.length).toBe(fixture.expected.length);
    for (let i = 0; i < fixture.expected.length; i += 1) {
      expect(issues[i].kind).toBe(fixture.expected[i].kind);
      expect(issues[i].severity).toBe(fixture.expected[i].severity);
      expect(issues[i].affectedAppointmentIds).toEqual(
        fixture.expected[i].affectedAppointmentIds,
      );
    }
  });
});
