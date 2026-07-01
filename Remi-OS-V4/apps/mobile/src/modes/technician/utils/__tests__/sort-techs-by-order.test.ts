import { sortTechsByOrder } from "@technician/utils/sort-techs-by-order";

type Tech = { id: number; name: string };

const techs: ReadonlyArray<Tech> = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Carol" },
  { id: 4, name: "Dave" },
];

describe("sortTechsByOrder", () => {
  it("returns an empty array for empty input regardless of techOrder", () => {
    expect(sortTechsByOrder([], [3, 1])).toEqual([]);
    expect(sortTechsByOrder([], undefined)).toEqual([]);
    expect(sortTechsByOrder([], [])).toEqual([]);
  });

  it("sorts present ids first, in the order given by techOrder", () => {
    const result = sortTechsByOrder(techs, [3, 1]);
    expect(result.map((t) => t.id)).toEqual([3, 1, 2, 4]);
  });

  it("appends ids missing from techOrder by ascending numeric id", () => {
    // techs deliberately given out of id order
    const shuffled: Tech[] = [
      { id: 4, name: "Dave" },
      { id: 2, name: "Bob" },
      { id: 1, name: "Alice" },
      { id: 3, name: "Carol" },
    ];
    const result = sortTechsByOrder(shuffled, [3, 1]);
    expect(result.map((t) => t.id)).toEqual([3, 1, 2, 4]);
  });

  it("ignores techOrder entries that don't match any input tech id", () => {
    // 99 is stale — not in roster — must not affect sort.
    const result = sortTechsByOrder(techs, [99, 3, 100, 1]);
    expect(result.map((t) => t.id)).toEqual([3, 1, 2, 4]);
  });

  it("returns input sorted by id ascending when techOrder is empty", () => {
    const shuffled: Tech[] = [
      { id: 4, name: "Dave" },
      { id: 2, name: "Bob" },
      { id: 1, name: "Alice" },
      { id: 3, name: "Carol" },
    ];
    expect(sortTechsByOrder(shuffled, []).map((t) => t.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("treats an undefined techOrder the same as an empty one", () => {
    const result = sortTechsByOrder(techs, undefined);
    expect(result.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  it("does not mutate the input array", () => {
    const original: Tech[] = [
      { id: 4, name: "Dave" },
      { id: 1, name: "Alice" },
    ];
    const snapshot = original.map((t) => t.id);
    sortTechsByOrder(original, [1, 4]);
    expect(original.map((t) => t.id)).toEqual(snapshot);
  });

  it("handles partial techOrder (only some present techs listed)", () => {
    const result = sortTechsByOrder(techs, [3]);
    // 3 first, then 1, 2, 4 by id
    expect(result.map((t) => t.id)).toEqual([3, 1, 2, 4]);
  });

  it("dedupes repeated ids in techOrder (first position wins)", () => {
    const result = sortTechsByOrder(techs, [3, 1, 3]);
    expect(result.map((t) => t.id)).toEqual([3, 1, 2, 4]);
  });
});
