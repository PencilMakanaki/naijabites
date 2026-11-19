import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.js';

export const SESSION_KEY = ['session'];

/** The signed-in person ({ user, area }) or null. Anyone not signed in gets null, not an error. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await api.get('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** The checkout page remembers an unpaid order in this tab. It belongs to one person, so forget it when the person changes. */
function clearCheckoutMemory() {
  try {
    window.sessionStorage.removeItem('naijabites.pendingPaymentOrderId');
    window.sessionStorage.removeItem('naijabites.checkoutIdempotencyKey');
  } catch { /* storage unavailable: nothing to clear */ }
}
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.post('/auth/login', values),
    onSuccess: (data) => {
      clearCheckoutMemory();
      queryClient.setQueryData(SESSION_KEY, { user: data.user, area: data.area });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
      onSettled: () => {
        clearCheckoutMemory();
        api.forgetCsrf();
      queryClient.setQueryData(SESSION_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    },
  });
}

/** Only allow paths inside this site, so a sign-in link cannot send people elsewhere. */
export function safeReturnPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback;
}
