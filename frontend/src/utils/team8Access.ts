const DEFAULT_TEAM8_DOMAINS = ['photonicomega.com', 'team8.tnvs'];

export function getTeam8AllowedDomains(): string[] {
  const configured = import.meta.env.VITE_TEAM8_ALLOWED_DOMAINS?.split(',')
    .map((domain: string) => domain.trim().toLowerCase())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_TEAM8_DOMAINS;
}

export function getEmailDomain(email: string): string {
  return email.trim().toLowerCase().split('@').pop() ?? '';
}

export function isTeam8Email(email: string): boolean {
  return getTeam8AllowedDomains().includes(getEmailDomain(email));
}

export function team8DomainLabel(): string {
  return getTeam8AllowedDomains().map((domain) => `@${domain}`).join(' or ');
}
