import { useCallback, useEffect, useRef, useState } from "react";
import { listItems } from "../../../api/items";

const PAGE_SIZE = 1000;

// The legacy spelling is stored under both names, so filtering by either
// would hide half the rows; fetch unfiltered and let the picker match.
const regionParam = (region) => {
  const v = (region || "").trim();
  if (!v || v === "Comilla Zone" || v === "Cumilla Zone") return null;
  return v;
};

// /items pages by distinct (division, code) pairs -- a page can hold more
// rows than the limit (one per region/year) -- so skip and "is there more"
// must count pairs, not rows.
const pairCount = (rows) => new Set(rows.map((it) => `${it.division_id}|${it.item_code}`)).size;

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.item_id ?? `${it.item_code}:${it.region}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Item-master rows the Add Item picker and the line importer choose from,
// for the estimation's region and rate year, paged in 1000 at a time.
// Waits for `enabled` (the estimation having loaded) so the rate-year
// filter is applied from the first request.
export function useItemCatalog({ region, rateYear, enabled }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const itemsRef = useRef([]);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const filtersRef = useRef({});
  const generationRef = useRef(0);

  const apply = (next, more) => {
    itemsRef.current = next;
    hasMoreRef.current = more;
    setItems(next);
    setHasMore(more);
  };

  const fetchPage = async (skip) => {
    const params = { skip, limit: PAGE_SIZE, ...filtersRef.current };
    return (await listItems(params, { timeout: 120000 })) || [];
  };

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    filtersRef.current = {};
    const r = regionParam(region);
    if (r) filtersRef.current.region = r;
    if (rateYear) filtersRef.current.rate_year = rateYear;
    loadingRef.current = true;
    setLoading(true);
    try {
      const batch = await fetchPage(0);
      if (generation !== generationRef.current) return;
      apply(dedupe(batch), pairCount(batch) === PAGE_SIZE);
    } catch (e) {
      console.error("Failed to fetch items", e);
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [region, rateYear]);

  // Returns the newly loaded rows (possibly empty) so callers can search
  // them without waiting for a re-render.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return [];
    const generation = generationRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const batch = await fetchPage(pairCount(itemsRef.current));
      if (generation !== generationRef.current) return [];
      apply(dedupe([...itemsRef.current, ...batch]), pairCount(batch) === PAGE_SIZE);
      return batch;
    } catch (e) {
      console.error("Failed to load more items", e);
      return [];
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { items, loading, hasMore, hasMoreRef, loadMore, reload };
}
