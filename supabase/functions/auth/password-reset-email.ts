function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] ?? character));
}

export function buildPasswordResetUrl(publicUrl: string, token: string): string {
  const origin = publicUrl.replace(/\/+$/, '').replace(/\/reservation-portal$/i, '');
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetEmail(resetUrl: string): { subject: string; text: string; html: string } {
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: 'Reset your Hirna Portal password',
    text: [
      'A password reset was requested for your Hirna Portal account.',
      `Reset your password: ${resetUrl}`,
      'This secure link expires in 30 minutes. If you did not request it, you can ignore this message.',
    ].join('\n\n'),
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h2>Reset your Hirna Portal password</h2><p>A password reset was requested for your account.</p><p><a href="${safeUrl}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Reset password</a></p><p>This secure link expires in 30 minutes. If you did not request it, you can ignore this message.</p></body></html>`,
  };
}
