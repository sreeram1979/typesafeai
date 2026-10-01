# Inbound Triage

One inbox for support tickets and sales leads. Each incoming email gets a single
[TypeSafe](https://typesafe.ai) request that asks every question at once. Plain
code then decides where it goes:

- **Needs review**: TypeSafe isn't confident what kind of email it is, so a person decides.
- **Support**: sorted P1 to P3 by urgency, tagged with the team that should handle it,
  and flagged when the customer hints they might leave.
- **Leads**: scored 0 to 100 from four judgments (deal size, timeline, buying
  authority, product fit). You set the weights with sliders. Leads asking for
  something the product doesn't do are set aside however big they are.
- **Archived**: spam, vendor pitches and anything else.

The sliders re-sort everything instantly from the stored answers. Changing a rule
never calls TypeSafe again.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
export TYPESAFE_API_KEY=your-key   # from your TypeSafe account
npm start                          # http://127.0.0.1:3000
```

On first start it analyzes the 12 sample emails in `data/samples.json` (12 API
requests) and saves the results to `data/inbox.json`. To re-analyze them, click
**Reload sample inbox**. To triage something new, paste an email into the form.

### Demo mode, without an API key

```sh
npm run demo
```

If no key is set, or you use `npm run demo`, the answers are faked with keyword
rules in `src/mock.ts` and the page shows a banner saying so. Use it to try the
interface. It tells you nothing about how well TypeSafe performs.

## How it's put together

| File | What it does |
| --- | --- |
| `src/questions.ts` | The eight TypeSafe questions. Change these to change what gets judged. |
| `src/company.ts` | Your product and pricing, sent with every request. Replace the fictional company with your own. |
| `public/logic.js` | Routing and scoring rules: review threshold, support priority, lead weights, the fit rule. |
| `src/triage.ts` | Calls TypeSafe, or demo mode, and validates pasted emails. |
| `src/server.ts` | A small Node HTTP server. The API key never reaches the browser. |
| `public/index.html`, `public/app.js` | The web page. |

The support and sales questions are asked *speculatively*. Each states its own
premise ("Assume this is a support request…"), and all of them run in parallel in
one request. The code then uses only the branch that matches the answer about what
kind of email it is. That keeps each email to one round trip.

## Before trusting it with real mail

- The default thresholds (60% review cut-off, P1 at urgency 2.5, churn at 50%) are
  starting guesses. Run a few hundred of your own emails through it and tune them
  against what your team would have done.
- Every card shows TypeSafe's full answer, with the probability of each option, so
  you can see why something went where it did.

## Checks

```sh
npm run typecheck
npm test
```
