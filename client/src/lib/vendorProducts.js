import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const VENDOR_PRODUCTS_KEY = ['vendor', 'products'];
export function useVendorProducts() {
  return useQuery({ queryKey: VENDOR_PRODUCTS_KEY, queryFn: async () => (await api.list('/vendor/products')).data, retry: false });
}
export function useSaveVendorProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => id ? api.patch(`/vendor/products/${id}`, body) : api.post('/vendor/products', body),
    onSuccess: () => client.invalidateQueries({ queryKey: VENDOR_PRODUCTS_KEY }),
  });
}
export function usePublishVendorProduct() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ id, isPublished }) => api.post(`/vendor/products/${id}/publish`, { isPublished }), onSuccess: () => client.invalidateQueries({ queryKey: VENDOR_PRODUCTS_KEY }) });
}
export function useArchiveVendorProduct() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id) => api.delete(`/vendor/products/${id}`), onSuccess: () => client.invalidateQueries({ queryKey: VENDOR_PRODUCTS_KEY }) });
}
export function useSearchProductImages() {
  return useMutation({ mutationFn: (q) => api.get(`/vendor/products/images/search?q=${encodeURIComponent(q)}`) });
}
export function useSaveProductMedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/vendor/products/${id}/media`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: VENDOR_PRODUCTS_KEY }),
  });
}
