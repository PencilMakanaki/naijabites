import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const DELIVERY_ZONES_KEY = ['admin', 'delivery-zones'];

export function useDeliveryZones() {
  return useQuery({
    queryKey: DELIVERY_ZONES_KEY,
    queryFn: async () => {
      const result = await api.list('/admin/delivery-zones');
      return result.data;
    },
    retry: false,
  });
}

export function useCreateDeliveryZone() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (values) => api.post('/admin/delivery-zones', values),
    onSuccess: () => client.invalidateQueries({
      queryKey: DELIVERY_ZONES_KEY,
    }),
  });
}

export function useUpdateDeliveryZone() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, values }) =>
      api.patch(`/admin/delivery-zones/${id}`, values),
    onSuccess: () => client.invalidateQueries({
      queryKey: DELIVERY_ZONES_KEY,
    }),
  });
}

export function useSetDeliveryZoneStatus() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }) =>
      api.patch(`/admin/delivery-zones/${id}/status`, { status }),
    onSuccess: () => client.invalidateQueries({
      queryKey: DELIVERY_ZONES_KEY,
    }),
  });
}