import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` — the returned value lags
 * `value` by `delay` ms during rapid changes, then catches up
 * once changes settle.
 *
 * Typical use: gate an expensive query (search endpoint, filter
 * recomputation) on a debounced version of a fast-changing input
 * (text field) so we don't fire a network request on every keystroke.
 *
 *   const [search, setSearch] = useState("");
 *   const debouncedSearch = useDebouncedValue(search, 250);
 *   const result = useCustomerSearch(debouncedSearch);
 *
 * 2026-05-25 — added to debounce the calendar's customer-search
 * input. Previously every keystroke triggered a `/calendar/v2/customers/search`
 * call; with 1,318 real franchise-169 customers a single search session
 * could fire 10+ requests with most rendering an already-stale list
 * by the time they returned.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
