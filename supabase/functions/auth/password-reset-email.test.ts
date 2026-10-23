import { buildPasswordResetEmail, buildPasswordResetUrl } from './password-reset-email.ts';

Deno.test('password reset URL normalizes the public origin and encodes the token', () => {
  const url = buildPasswordResetUrl('https://portal.example.test/reservation-portal/', 'token +/=?');
  const expected = 'https://portal.example.test/reset-password?token=token%20%2B%2F%3D%3F';
  if (url !== expected) throw new Error(`expected ${expected}, got ${url}`);
});

Deno.test('password reset email gives a time limit and the exact secure link', () => {
  const message = buildPasswordResetEmail('https://portal.example.test/reset-password?token=abc');
  if (message.subject !== 'Reset your Hirna Portal password') throw new Error('unexpected subject');
  if (!message.text.includes('30 minutes')) throw new Error('missing reset expiry');
  if (!message.text.includes('https://portal.example.test/reset-password?token=abc')) throw new Error('missing reset link');
  if (!message.html.includes('Reset password')) throw new Error('missing accessible action label');
});
