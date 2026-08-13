/**
 * Developer Console security-awareness warning.
 *
 * Shows a single styled self-XSS warning in the browser console when the app
 * starts. This is a purely informational/awareness measure - it provides NO
 * security by itself. Real protection (authentication, authorization,
 * validation, rate limiting, audit logging, secrets handling) must always be
 * enforced on the backend and never in client-side JavaScript.
 *
 * It never tries to detect, block, or interfere with DevTools, right-click,
 * keyboard shortcuts, or accessibility.
 */

let initialized = false;

/**
 * Prints the warning exactly once per page load. Safe to call multiple times;
 * repeated calls are ignored, so it cannot flood the console.
 */
export function initSecurityConsoleWarning(): void {
  if (initialized) return;
  initialized = true;

  if (typeof window === 'undefined' || typeof console === 'undefined') {
    return;
  }

  console.log(
    '%cSTOP!\n%c\n' +
      'This browser feature is intended for developers.\n' +
      '\n' +
      'Do not paste or execute code from other people into the Developer Console. ' +
      'Malicious code can compromise your account, session, or sensitive information.\n' +
      '\n' +
      'If someone asks you to paste code here to "fix", "unlock", "verify", or "hack" something, ' +
      'do not do it.\n' +
      '\n' +
      'Never paste code into the Developer Console unless you understand exactly what it does. ' +
      'Attackers may use social engineering to trick you into executing malicious code that can ' +
      'expose your account or session.',
    'color:#ff4d4d; font-family:monospace; font-size:32px; font-weight:900; ' +
      'letter-spacing:3px; text-shadow:0 0 12px rgba(255,77,77,0.6);',
    'color:#e6e6e6; background:rgba(20,20,20,0.92); font-family:monospace; ' +
      'font-size:13px; line-height:1.7;'
  );
}
