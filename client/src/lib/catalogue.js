import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, api } from './api.js';
import { marketsOrFallback } from './markets.js';

export function toQueryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

const noRetryOn404 = (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1;

/** The markets. Never undefined: while loading, or if loading fails, the built-in list is used. */
export function useMarkets() {
  const query = useQuery({ queryKey: ['markets'], queryFn: () => api.get('/markets'), staleTime: 5 * 60_000 });
  return { ...query, data: marketsOrFallback(query.data) };
}

/** A page-by-page product list for the given filters (market, q, vendor...). */
export function useProducts(filters) {
  return useInfiniteQuery({
    queryKey: ['products', filters],
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => api.list(`/products?${toQueryString({ ...filters, limit: 12, cursor: pageParam })}`),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

export function useProduct(id) {
  return useQuery({ queryKey: ['product', id], queryFn: () => api.get(`/products/${id}`), retry: noRetryOn404 });
}

export function useVendor(slug) {
  return useQuery({ queryKey: ['vendor', slug], queryFn: () => api.get(`/vendors/${slug}`), retry: noRetryOn404 });
}
