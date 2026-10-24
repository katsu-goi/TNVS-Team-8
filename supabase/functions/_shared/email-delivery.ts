export type EmailDelivery = 'SENT' | 'SIMULATED' | 'FAILED';

export type EmailMessage = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDeliveryOptions = {
  apiKey?: string | null;
  from?: string | null;
  fetchImpl?: typeof fetch;
};

export async function deliverEmail(
  message: EmailMessage,
  options: EmailDeliveryOptions = {},
): Promise<{ status: EmailDelivery; error?: string }> {
  const apiKey = (options.apiKey ?? Deno.env.get('RESEND_API_KEY'))?.trim();
  const from = (options.from ?? Deno.env.get('RESEND_FROM_EMAIL'))?.trim();
  if (!apiKey || !from) return { status: 'SIMULATED' };

  try {
    const response = await (options.fetchImpl ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.recipient],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const responseText = await response.text();
      return { status: 'FAILED', error: `Resend returned HTTP ${response.status}: ${responseText.slice(0, 240)}` };
    }
    return { status: 'SENT' };
  } catch (error) {
    return { status: 'FAILED', error: error instanceof Error ? error.message : 'Resend request failed' };
  }
}
