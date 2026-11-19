import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const VENDOR_APPLICATION_KEY = ['vendor', 'application'];

/** The signed-in person's vendor application, or null when they have not applied. */
export function useVendorApplication(enabled) {
  return useQuery({ queryKey: VENDOR_APPLICATION_KEY, queryFn: () => api.get('/vendor-applications/mine'), enabled, retry: false });
}
export function useApplyAsVendor() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.post('/vendor-applications', values),
    onSuccess: (data) => client.setQueryData(VENDOR_APPLICATION_KEY, data),
  });
}
export function useUploadVendorDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ type, file }) => api.upload(`/vendor-applications/documents/${type}`, file, { 'X-File-Name': encodeURIComponent(file.name) }),
    onSuccess: (data) => client.setQueryData(VENDOR_APPLICATION_KEY, data),
  });
}
