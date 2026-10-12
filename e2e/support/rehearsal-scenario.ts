import type { Scenario, ScenarioEntry } from '../../packages/server/src/demo/story/scenario.ts';
import { DISCOUNT_ROUNDING } from '../../packages/server/src/demo/story/storefront/discount-rounding.ts';

/**
 * Requests whose challenge proposes the discount rule of the story, the one the implementer stops to ask
 * the operator about: each becomes an issue that needs a person, so a spec can answer it, rewrite its
 * checks or abandon it without touching another.
 */
export const DECISION_REQUESTS = [
  { title: 'Percentage discounts do not add up at checkout', body: 'The discount shown on the checkout summary is a cent away from what the payment provider charges for some carts. Can we make them agree?' },
  { title: 'Discount codes round differently on each line', body: 'When a code takes 5% off a cart of several lines, the summary and the invoice show different discount amounts. We need one rule.' },
  { title: 'Checkout discount differs from the card charge', body: 'Some customers see a discount on the summary that is not the amount taken off their card. Please look at how the discount is computed.' },
] as const;

function jsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

/** The challenger's prompt carries the text of the request and not its title, so the scripted challenge is chosen by that text. */
function challengeOf(request: { readonly body: string }): ScenarioEntry {
  const { spec } = DISCOUNT_ROUNDING;
  const answer = {
    summary: 'The request comes down to one rule about rounding, and it is ready to be written as work.',
    items: [
      {
        title: spec.title,
        verdict: 'keep',
        currentState: 'The pricing module has no rule for percentage discounts yet.',
        intent: 'The discount on the summary equals the amount the payment provider takes off, to the cent.',
        idea: 'One function that rounds the discount of the whole cart once.',
        method: 'A percentageDiscount function in src/pricing.js that takes the line totals and a percentage.',
        reason: 'Rounding each line separately is what makes the amounts drift apart.',
        question: null,
        sources: [{ label: 'Pricing module', reference: 'src/pricing.js:1' }],
      },
    ],
    specs: [{ title: spec.title, type: spec.type, items: [1], need: spec.need, acceptanceCriteria: [...spec.acceptanceCriteria], outOfScope: [...spec.outOfScope], expectedProof: spec.expectedProof }],
    reply: 'Thanks for the report. We will write one rule for percentage discounts and check it against the provider.',
  };
  return { role: 'challenger', when: request.body, attempts: [{ steps: [], final: `${answer.summary}\n\n${jsonBlock(answer)}` }] };
}

/** The story's scenario, plus the challenges of the requests the specs of a rehearsal create. */
export function rehearsalScenario(story: Scenario): Scenario {
  return { ...story, entries: [...story.entries, ...DECISION_REQUESTS.map(challengeOf)] };
}
