// Typed auth API wrappers. All requests go through `apiJson` so they pick
// up cookie-credentials + auto-refresh + ApiResponseError shaping.

import type {
  LoginRequest,
  LoginResponse,
  ResendCodeRequest,
  ResendCodeResponse,
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
