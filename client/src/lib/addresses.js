import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const ADDRESSES_KEY = ['customer', 'addresses'];
export const useAddresses = () => useQuery({ queryKey: ADDRESSES_KEY, queryFn: () => api.get('/me/addresses'), retry: false });

function useAddressMutation(mutationFn) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => client.invalidateQueries({ queryKey: ADDRESSES_KEY }) });
}
export const useCreateAddress = () => useAddressMutation((values) => api.post('/me/addresses', values));
export const useUpdateAddress = () => useAddressMutation(({ id, values }) => api.patch(`/me/addresses/${id}`, values));
export const useDeleteAddress = () => useAddressMutation((id) => api.delete(`/me/addresses/${id}`));
export const useSetDefaultAddress = () => useAddressMutation((id) => api.post(`/me/addresses/${id}/default`));
export const useCheckoutSummary = (addressId = '') => useQuery({
  queryKey: ['checkout', 'summary', addressId],
  queryFn: () => api.get(
    addressId
      ? `/me/checkout?addressId=${encodeURIComponent(addressId)}`
      : '/me/checkout',
  ),
  retry: false,
});