import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const CART_KEY = ['cart'];

export function useCart({ enabled = true } = {}) {
  return useQuery({ queryKey: CART_KEY, queryFn: () => api.get('/me/cart'), enabled, retry: false });
}

function useCartMutation(mutationFn) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: (cart) => client.setQueryData(CART_KEY, cart) });
}

export function useAddCartItem() {
  return useCartMutation(({ productId, quantity = 1 }) => api.post('/me/cart/items', { productId, quantity }));
}
export function useSetCartQuantity() {
  return useCartMutation(({ productId, quantity }) => api.patch(`/me/cart/items/${productId}`, { quantity }));
}
export function useRemoveCartItem() {
  return useCartMutation((productId) => api.delete(`/me/cart/items/${productId}`));
}
export function useClearCart() {
  return useCartMutation(() => api.delete('/me/cart'));
}
