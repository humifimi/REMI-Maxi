/**
 * 2026-05-25 — order-filter-sheet helper tests.
 *
 * Covers the new filters + sort added in the same PR:
 *
 *   - `sortOrders` with each sortBy/sortDir combination
 *   - `applyOrderFilters` for the new chips: technician,
 *     amountRange, hasAddress
 *   - `getActiveOrderFilterCount` excludes sortBy/sortDir
 *     (they reorder, don't filter)
 *   - `EMPTY_ORDER_FILTERS` defaults match `DEFAULT_ORDER_SORT`
 *     so the first-render list lands on
 *     scheduled-date-descending (the operator's stated preference)
 */

import type { Appointment } from "@technician/types/api";
import {
  applyOrderFilters,
  sortOrders,
  getActiveOrderFilterCount,
  EMPTY_ORDER_FILTERS,
  DEFAULT_ORDER_SORT,
  type OrderFilters,
} from "../order-filter-sheet";

function makeAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    customer_id: 100,
    technician_id: null,
    vehicle_id: null,
    address_id: null,
    franchise_id: 169,
    status: "created" as Appointment["status"],
    scheduled_date: "2026-05-25",
    scheduled_time: "10:00:00",
    notes: null,
    cancellation_reason: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-05-25T08:00:00Z",
    updated_at: "2026-05-25T08:00:00Z",
    ...overrides,
  };
}

describe("sortOrders", () => {
  it("defaults to scheduledDate DESC — newest scheduled first", () => {
    const orders = [
      makeAppt({ id: 1, scheduled_date: "2026-05-20", scheduled_time: "10:00:00" }),
      makeAppt({ id: 2, scheduled_date: "2026-05-25", scheduled_time: "10:00:00" }),
      makeAppt({ id: 3, scheduled_date: "2026-05-23", scheduled_time: "10:00:00" }),
    ];
    const sorted = sortOrders(orders, "scheduledDate", "desc");
    expect(sorted.map((o) => o.id)).toEqual([2, 3, 1]);
  });

  it("scheduledDate ASC — oldest first", () => {
    const orders = [
      makeAppt({ id: 1, scheduled_date: "2026-05-20" }),
      makeAppt({ id: 2, scheduled_date: "2026-05-25" }),
      makeAppt({ id: 3, scheduled_date: "2026-05-23" }),
    ];
    const sorted = sortOrders(orders, "scheduledDate", "asc");
    expect(sorted.map((o) => o.id)).toEqual([1, 3, 2]);
  });

  it("breaks scheduled-date ties via scheduled_time", () => {
    const orders = [
      makeAppt({ id: 1, scheduled_date: "2026-05-25", scheduled_time: "08:00:00" }),
      makeAppt({ id: 2, scheduled_date: "2026-05-25", scheduled_time: "14:00:00" }),
      makeAppt({ id: 3, scheduled_date: "2026-05-25", scheduled_time: "11:00:00" }),
    ];
    const sorted = sortOrders(orders, "scheduledDate", "desc");
    expect(sorted.map((o) => o.id)).toEqual([2, 3, 1]);
  });

  it("sorts by createdAt", () => {
    const orders = [
      makeAppt({ id: 1, created_at: "2026-01-01T00:00:00Z" }),
      makeAppt({ id: 2, created_at: "2026-05-25T00:00:00Z" }),
      makeAppt({ id: 3, created_at: "2026-03-15T00:00:00Z" }),
    ];
    expect(sortOrders(orders, "createdAt", "desc").map((o) => o.id)).toEqual([2, 3, 1]);
    expect(sortOrders(orders, "createdAt", "asc").map((o) => o.id)).toEqual([1, 3, 2]);
  });

  it("sorts by amount", () => {
    const orders = [
      makeAppt({ id: 1, total_amount: 100 }),
      makeAppt({ id: 2, total_amount: 500 }),
      makeAppt({ id: 3, total_amount: 250 }),
    ];
    expect(sortOrders(orders, "amount", "desc").map((o) => o.id)).toEqual([2, 3, 1]);
    expect(sortOrders(orders, "amount", "asc").map((o) => o.id)).toEqual([1, 3, 2]);
  });

  it("breaks ties stably via id DESC", () => {
    const orders = [
      makeAppt({ id: 1, total_amount: 100 }),
      makeAppt({ id: 2, total_amount: 100 }),
      makeAppt({ id: 3, total_amount: 100 }),
    ];
    expect(sortOrders(orders, "amount", "desc").map((o) => o.id)).toEqual([3, 2, 1]);
  });

  it("does not mutate the input array", () => {
    const orders = [
      makeAppt({ id: 1, scheduled_date: "2026-01-01" }),
      makeAppt({ id: 2, scheduled_date: "2026-12-31" }),
    ];
    const before = orders.map((o) => o.id);
    sortOrders(orders, "scheduledDate", "desc");
    expect(orders.map((o) => o.id)).toEqual(before);
  });
});

describe("applyOrderFilters — new filters", () => {
  const baseFilter: OrderFilters = EMPTY_ORDER_FILTERS;

  it("filters by technician (exact match)", () => {
    const orders = [
      makeAppt({ id: 1, technician_name: "Josh Bishop" }),
      makeAppt({ id: 2, technician_name: "Todd Phlipot" }),
      makeAppt({ id: 3, technician_name: "Josh Bishop" }),
    ];
    const filtered = applyOrderFilters(orders, { ...baseFilter, technician: "Josh Bishop" });
    expect(filtered.map((o) => o.id)).toEqual([1, 3]);
  });

  it("filters by amount range — Under $100", () => {
    const orders = [
      makeAppt({ id: 1, total_amount: 50 }),
      makeAppt({ id: 2, total_amount: 99.99 }),
      makeAppt({ id: 3, total_amount: 100 }),
    ];
    const filtered = applyOrderFilters(orders, { ...baseFilter, amountRange: "Under $100" });
    expect(filtered.map((o) => o.id)).toEqual([1, 2]);
  });

  it("filters by amount range — $100 – $500", () => {
    const orders = [
      makeAppt({ id: 1, total_amount: 99.99 }),
      makeAppt({ id: 2, total_amount: 100 }),
      makeAppt({ id: 3, total_amount: 499.99 }),
      makeAppt({ id: 4, total_amount: 500 }),
    ];
    const filtered = applyOrderFilters(orders, { ...baseFilter, amountRange: "$100 – $500" });
    expect(filtered.map((o) => o.id)).toEqual([2, 3]);
  });

  it("filters by amount range — Over $1,500", () => {
    const orders = [
      makeAppt({ id: 1, total_amount: 1500 }),
      makeAppt({ id: 2, total_amount: 1499 }),
      makeAppt({ id: 3, total_amount: 50000 }),
    ];
    const filtered = applyOrderFilters(orders, { ...baseFilter, amountRange: "Over $1,500" });
    expect(filtered.map((o) => o.id)).toEqual([1, 3]);
  });

  it("filters by hasAddress = true", () => {
    const orders = [
      makeAppt({ id: 1, address_line: "123 Main St" }),
      makeAppt({ id: 2, address_line: null }),
      makeAppt({ id: 3, address_line: "" }),
      makeAppt({ id: 4, address_line: "   " }),
    ];
    const filtered = applyOrderFilters(orders, { ...baseFilter, hasAddress: true });
    expect(filtered.map((o) => o.id)).toEqual([1]);
  });

  it("filters by hasAddress = false", () => {
    const orders = [
      makeAppt({ id: 1, address_line: "123 Main St" }),
      makeAppt({ id: 2, address_line: null }),
      makeAppt({ id: 3, address_line: "" }),
    ];
    const filtered = applyOrderFilters(orders, { ...baseFilter, hasAddress: false });
    expect(filtered.map((o) => o.id)).toEqual([2, 3]);
  });
});

describe("getActiveOrderFilterCount", () => {
  it("returns 0 when nothing is active (sortBy/sortDir are default but not counted)", () => {
    expect(getActiveOrderFilterCount(EMPTY_ORDER_FILTERS)).toBe(0);
  });

  it("does NOT count sortBy or sortDir as active filters", () => {
    const f: OrderFilters = {
      ...EMPTY_ORDER_FILTERS,
      sortBy: "amount",
      sortDir: "asc",
    };
    expect(getActiveOrderFilterCount(f)).toBe(0);
  });

  it("counts each populated filter once", () => {
    const f: OrderFilters = {
      ...EMPTY_ORDER_FILTERS,
      status: "Finalized",
      technician: "Josh",
      amountRange: "Over $1,500",
      hasAddress: true,
    };
    expect(getActiveOrderFilterCount(f)).toBe(4);
  });
});

describe("EMPTY_ORDER_FILTERS defaults", () => {
  it("uses createdAt DESC as the default sort", () => {
    expect(EMPTY_ORDER_FILTERS.sortBy).toBe("createdAt");
    expect(EMPTY_ORDER_FILTERS.sortDir).toBe("desc");
    expect(DEFAULT_ORDER_SORT).toEqual({ sortBy: "createdAt", sortDir: "desc" });
  });
});
