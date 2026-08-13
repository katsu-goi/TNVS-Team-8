const PERSONAL_DOMAIN_PREFIXES = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'gmx.net',
  'zoho.com',
  'yandex.com',
  'mail.com',
  'mail.ru',
  '163.com',
  '126.com',
  'qq.com',
  'foxmail.com',
  'web.de',
  'naver.com',
  'tutanota.com',
];

export const EMAIL_EMPTY_MESSAGE = 'Corporate email is required.';
export const EMAIL_INVALID_FORMAT_MESSAGE = 'Please enter a valid corporate email address.';
export const EMAIL_PERSONAL_PROVIDER_MESSAGE =
  'Personal email providers are not accepted. Please use your corporate email.';

export function getEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

/** True when the email's domain belongs to a personal / free-mail provider. */
export function isPersonalEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return PERSONAL_DOMAIN_PREFIXES.some(
    (p) => domain === p || domain.startsWith(p + '.')
  );
}

/** True when the email uses a corporate (non-personal provider) domain. */
export function isCorporateEmail(email: string): boolean {
  return !isPersonalEmail(email);
}

/**
 * Full corporate-email validator. Returns an empty string when valid,
 * otherwise one of the error messages.
 */
export function validateCorporateEmail(value: string): string {
  if (!value.trim()) return EMAIL_EMPTY_MESSAGE;
  if (/\s/.test(value)) return EMAIL_INVALID_FORMAT_MESSAGE;

  const at = value.indexOf('@');
  // Rejects plain text (no @), @company.com (empty username) and
  // employee@@company.com (more than one @).
  if (at <= 0 || at !== value.lastIndexOf('@')) return EMAIL_INVALID_FORMAT_MESSAGE;

  const username = value.slice(0, at);
  const domain = value.slice(at + 1);

  if (!/^[A-Za-z0-9._%+-]+$/.test(username)) return EMAIL_INVALID_FORMAT_MESSAGE;
  // Rejects employee..test@company.com and .x@ / x.@
  if (
    username.startsWith('.') ||
    username.endsWith('.') ||
    username.includes('..')
  ) {
    return EMAIL_INVALID_FORMAT_MESSAGE;
  }
  // Rejects employee@company (no extension), employee@.com and bad TLDs.
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(domain)) {
    return EMAIL_INVALID_FORMAT_MESSAGE;
  }

  if (isPersonalEmail(value)) return EMAIL_PERSONAL_PROVIDER_MESSAGE;
  return '';
}
