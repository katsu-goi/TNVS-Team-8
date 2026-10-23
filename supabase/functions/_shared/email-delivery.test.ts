import { deliverEmail } from './email-delivery.ts';

Deno.test('email delivery is explicit when credentials are not configured', async () => {
  let called = false;
  const result = await deliverEmail(
    { recipient: 'employee@example.test', subject: 'Subject', text: 'Text', html: '<p>Text</p>' },
    { apiKey: '', from: '', fetchImpl: async () => { called = true; return new Response(); } },
  );
  if (result.status !== 'SIMULATED') throw new Error(`expected SIMULATED, got ${result.status}`);
  if (called) throw new Error('mail provider must not be called without credentials');
});

Deno.test('email delivery sends the complete message through Resend', async () => {
  let requestUrl = '';
  let authorization = '';
  let payload: Record<string, unknown> = {};
  const result = await deliverEmail(
    { recipient: 'employee@example.test', subject: 'Reset password', text: 'Reset text', html: '<p>Reset</p>' },
    {
      apiKey: 'test-key', from: 'Hirna <noreply@example.test>',
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requestUrl = request.url;
        authorization = request.headers.get('authorization') ?? '';
        payload = await request.json();
        return new Response('{}', { status: 200 });
      },
    },
  );
  if (result.status !== 'SENT') throw new Error(`expected SENT, got ${result.status}`);
  if (requestUrl !== 'https://api.resend.com/emails') throw new Error(`unexpected URL ${requestUrl}`);
  if (authorization !== 'Bearer test-key') throw new Error('missing provider authorization');
  const recipients = payload.to as string[];
  if (recipients[0] !== 'employee@example.test' || payload.subject !== 'Reset password' || payload.text !== 'Reset text' || payload.html !== '<p>Reset</p>') {
    throw new Error(`unexpected message payload ${JSON.stringify(payload)}`);
  }
});

Deno.test('email delivery reports provider failures without throwing secrets', async () => {
  const result = await deliverEmail(
    { recipient: 'employee@example.test', subject: 'Subject', text: 'Text', html: '<p>Text</p>' },
    { apiKey: 'test-key', from: 'noreply@example.test', fetchImpl: async () => new Response('provider rejected', { status: 503 }) },
  );
  if (result.status !== 'FAILED' || !result.error?.includes('HTTP 503')) throw new Error(`unexpected failure ${JSON.stringify(result)}`);
  if (result.error.includes('test-key')) throw new Error('provider secret leaked in failure');
});
