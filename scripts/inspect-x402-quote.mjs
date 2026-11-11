// Read-only x402 quote inspector. Never signs, pays, retries a 402, or prints credentials.
import {fetchX402Quote} from '../src/x402.mjs';
const endpoint=process.env.X402_QUOTE_URL;
const allowedHost=process.env.X402_ALLOWED_HOST;
if(!endpoint||!allowedHost) {
  console.error('Set X402_QUOTE_URL (exact HTTPS resource) and X402_ALLOWED_HOST (exact hostname).');
  process.exit(2);
}
try {
  const result=await fetchX402Quote(endpoint,{allowedHost});
  console.log('PAYJURY_X402_QUOTE_READ_ONLY',JSON.stringify(result));
  if(result.choiceCount===0)process.exitCode=2;
} catch {
  console.error('X402_QUOTE_UNVERIFIED: no payment was sent. Check exact host, HTTPS, provider availability and x402 v2 quote.');
  process.exitCode=1;
}
