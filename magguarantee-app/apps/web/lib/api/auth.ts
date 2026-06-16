// Typed auth API wrappers. All requests go through `apiJson` so they pick
// up cookie-credentials + auto-refresh + ApiResponseError shaping.

import type {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  ResendCodeRequest,
  ResendCodeResponse,
  ResendResetCodeRequest,
  ResetPasswordRequest,
  UserDto,
  VerifyCodeRequest,
  VerifyCodeResponse,
} from '@magguarantee/shared';

import { apiJson } from './client';

export function login(body: LoginRequest): Promise<LoginResponse> {
  return apiJson<LoginResponse>('/auth/login', { method: 'POST', json: body });
}

export function verifyCode(
  body: VerifyCodeRequest,
): Promise<VerifyCodeResponse> {
  return apiJson<VerifyCodeResponse>('/auth/verify-code', {
    method: 'POST',
    json: body,
  });
}

export function resendCode(
  body: ResendCodeRequest,
): Promise<ResendCodeResponse> {
  return apiJson<ResendCodeResponse>('/auth/resend-code', {
    method: 'POST',
    json: body,
  });
}

export function logout(): Promise<void> {
  return apiJson<void>('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<UserDto> {
  return apiJson<UserDto>('/auth/me', { method: 'GET' });
}

// ─── Password reset (forgot-password) flow — Phase 9 ────────────
//
// Anti-enumeration: `forgotPassword` always resolves 200 with the same shape
// whether or not the account exists. Callers must NOT branch on "not found".

export function forgotPassword(
  body: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> {
  return apiJson<ForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    json: body,
  });
}

/** Confirm reset with the emailed code + new password. 204 on success. */
export function resetPassword(body: ResetPasswordRequest): Promise<void> {
  return apiJson<void>('/auth/reset-password', { method: 'POST', json: body });
}

export function resendResetCode(
  body: ResendResetCodeRequest,
): Promise<ResendCodeResponse> {
  return apiJson<ResendCodeResponse>('/auth/resend-reset-code', {
    method: 'POST',
    json: body,
  });
}

// ─── Forced / self-service change-password (authenticated) — Phase 9 ──
//
// Callable while `mustChangePassword=true`. The server sets fresh auth cookies
// with the flag cleared and returns the updated user.

export function changePassword(
  body: ChangePasswordRequest,
): Promise<{ user: UserDto }> {
  return apiJson<{ user: UserDto }>('/auth/change-password', {
    method: 'POST',
    json: body,
  });
}
