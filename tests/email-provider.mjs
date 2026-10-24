// Test-only fetch adapter loaded only by the isolated email integration server.
import { appendFileSync, readFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.resend.com/emails') throw new Error('Unexpected test network request');
  const body = JSON.parse(options.body);
  appendFileSync(process.env.TEST_EMAIL_LOG, JSON.stringify(body) + '\n');
  if (readFileSync(process.env.TEST_EMAIL_MODE, 'utf8') === 'fail') return new Response('{}', { status: 503 });
  return new Response(JSON.stringify({ id: 'test-delivery' }), { status: 200 });
};
