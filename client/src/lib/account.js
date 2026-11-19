import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { SESSION_KEY } from './session.js';

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.post('/auth/register', values),
    onSuccess: (data) => queryClient.setQueryData(SESSION_KEY, { user: data.user, area: data.area }),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token) => api.post('/auth/verify-email', { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

export const useResendVerification = () => useMutation({ mutationFn: () => api.post('/auth/resend-verification') });
export const useForgotPassword = () => useMutation({ mutationFn: (email) => api.post('/auth/forgot-password', { email }) });

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.post('/auth/reset-password', values),
    onSuccess: () => {
      api.forgetCsrf();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });
}

export const useChangePassword = () => useMutation({ mutationFn: (values) => api.post('/auth/change-password', values) });

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => api.patch('/me/profile', values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

export const useRequestEmailChange = () => useMutation({ mutationFn: (values) => api.post('/me/email-change', values) });

export function useConfirmEmailChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token) => api.post('/auth/confirm-email-change', { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

const SESSIONS_KEY = ['account', 'sessions'];
export const useSessions = () => useQuery({ queryKey: SESSIONS_KEY, queryFn: () => api.get('/me/sessions') });

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/me/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/me/sessions'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
