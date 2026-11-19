import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const VENDOR_ORDERS_KEY = ['vendor', 'orders'];

export function useVendorOrders({ page = 1, pageSize = 10 } = {}) {
  return useQuery({
    queryKey: [...VENDOR_ORDERS_KEY, { page, pageSize }],
    queryFn: async () => {
      const result = await api.list(
        `/vendor/orders?page=${page}&pageSize=${pageSize}`
      );

      return {
        orders: result.data,
        pagination: result.meta,
        summary: result.meta.summary,
        };
    },
    retry: false,
  });
}

export function useVendorOrder(id) {
  return useQuery({
    queryKey: [...VENDOR_ORDERS_KEY, 'detail', id],
    queryFn: () => api.get(`/vendor/orders/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAcceptVendorOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id) => api.post(`/vendor/orders/${id}/accept`, {}),
    onSuccess: (_, id) => {
      client.invalidateQueries({ queryKey: VENDOR_ORDERS_KEY });
      client.invalidateQueries({
        queryKey: [...VENDOR_ORDERS_KEY, 'detail', id],
      });
    },
  });
}

export function useRejectVendorOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }) =>
      api.post(`/vendor/orders/${id}/reject`, { reason }),
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: VENDOR_ORDERS_KEY });
      client.invalidateQueries({
        queryKey: [...VENDOR_ORDERS_KEY, 'detail', variables.id],
      });
    },
  });
}