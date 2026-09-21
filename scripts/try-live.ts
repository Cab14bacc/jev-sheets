// Live check against the real API: sends one request with a Noul, a Choice and
// a Score and validates the answers with the same parser the add-on uses.
// Run: TYPESAFE_API_KEY=... npm run try
import { buildHttpRequest, choice, DEFAULT_MODEL, noul, parseHttpResponse, score } from "../src/core";

const apiKey = process.env.TYPESAFE_API_KEY ?? "";
if (!apiKey) {
  console.error("Set TYPESAFE_API_KEY first.");
  process.exit(1);
}

const req = buildHttpRequest(apiKey, {
  state: "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
  model: process.env.JEV_MODEL ?? DEFAULT_MODEL,
  questions: {
    is_urgent: noul("Does this message express urgency?"),
    department: choice("Which team should handle this?", ["billing", "technical", "sales"]),
    frustration: score("How frustrated does the customer appear?", ["Calm", "Frustrated but civil", "Very angry"]),
  },
});

const started = Date.now();
const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
const elapsed = Date.now() - started;
const parsed = parseHttpResponse(res.status, await res.text(), ["is_urgent", "department", "frustration"]);

console.log(`OK: ${parsed.model} answered in ${elapsed} ms (${parsed.usage.input_tokens} input tokens)`);
console.log(JSON.stringify(parsed.answers, null, 2));
