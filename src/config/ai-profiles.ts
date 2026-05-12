export interface ContextProfile {
  id: string;
  name: string;
  description: string;
  context: string;
  isDefault: boolean;
}

export const DEFAULT_CONTEXT_PROFILES: ContextProfile[] = [
  {
    id: 'emergency-campaign',
    name: 'Emergency Campaign',
    description: 'Crisis and disaster response donation pages',
    context: `This is an emergency/crisis donation page. Apply these CRO guidelines:
- Lean on urgency messaging — time-pressured language and concrete problem framing
- CTAs: 3-5 words maximum, action-oriented and time-sensitive
- Front-load the core problem in the first 10 words of the description
- Description max 40-50 words — mobile scanning is critical
- Include specific numbers for scope where credible (people affected, lives at risk)
- List tangible interventions — what the donation actually funds
- Keep minimum gift accessible (typically $25-$50) — emergency response benefits from a low barrier
- Mobile-first: assume >50% mobile traffic`,
    isDefault: true,
  },
  {
    id: 'general-donation',
    name: 'General Donation',
    description: 'Evergreen main donation pages',
    context: `This is a general/evergreen donation page. Apply these CRO guidelines:
- Lean on narrative/community messaging — collective action and long-term impact framing
- CTAs use community language: action verbs paired with collective pronouns ("Together", "Join", "Our", "We")
- Description 40-60 words with community hook + specific impact + systemic change
- Balance immediate relief with long-term impact positioning
- Minimum gift typically $50-$100 for high-intent website traffic; tune to the page's median gift
- Desktop-dominant: narrative messaging resonates strongly on desktop`,
    isDefault: true,
  },
  {
    id: 'paid-ads-landing',
    name: 'Paid Ads Landing',
    description: 'Landing pages for paid acquisition traffic',
    context: `This is a paid ads landing page. Apply these CRO guidelines:
- Ultra-short CTAs that match the ad's message and creative
- Direct response framing — immediate value proposition, no preamble
- Description under 40 words — match the ad's promise quickly
- Keep minimum gift low (typically $25-$50) — cold acquisition needs a low barrier
- Expect high mobile traffic (40-70%) — mobile-first design
- No organizational storytelling — focus on specific, tangible impact
- Clear problem-solution framing matching ad creative`,
    isDefault: true,
  },
  {
    id: 'email-appeal',
    name: 'Email Appeal',
    description: 'Donation pages linked from email campaigns',
    context: `This is an email-driven donation page. Apply these CRO guidelines:
- Hybrid approach: narrative framework with urgency elements layered in
- CTAs combine collective and time-pressured language (e.g., collective action verb + urgency modifier)
- High-intent audience — email readers are warm leads
- Can support $100+ minimum gift (email donors typically have higher median gifts)
- Description should extend the email's narrative, not repeat it
- Often desktop-dominant (<30% mobile typical) — narrative messaging plays well
- Urgency elements amplify the email's call-to-action`,
    isDefault: true,
  },
  {
    id: 'recurring-giving',
    name: 'Recurring Giving',
    description: 'Monthly and sustainer donation pages',
    context: `This is a recurring/monthly giving page. Apply these CRO guidelines:
- Long-term impact framing: emphasize sustained change over one-time crisis response
- Lower ask amounts appropriate for monthly commitments ($10-$50/month)
- Relationship language: "partner", "sustainer", "monthly champion"
- Emphasize what ongoing support achieves vs one-time gifts
- Social proof particularly important: "Join X monthly donors"
- Stability and trust messaging — donors commit to recurring billing
- Highlight flexibility: easy to cancel, change amount anytime`,
    isDefault: true,
  },
  {
    id: 'event-campaign',
    name: 'Event/Campaign',
    description: 'Time-bound campaigns or fundraising events',
    context: `This is a time-bound campaign or event page. Apply these CRO guidelines:
- Deadline urgency: specific end dates, countdown language
- Goal-oriented: "Help us reach $X by [date]"
- Progress indicators and social proof (X donors, Y% of goal)
- Campaign-specific messaging that matches promotional materials
- Higher urgency acceptable due to time constraint
- Consider matching gift messaging if applicable
- CTAs reference the specific campaign or event name`,
    isDefault: true,
  },
];

export function getProfileById(profiles: ContextProfile[], id: string | null): ContextProfile {
  if (!id) return profiles.find((p) => p.id === 'general-donation') || profiles[0];
  return (
    profiles.find((p) => p.id === id) ||
    profiles.find((p) => p.id === 'general-donation') ||
    profiles[0]
  );
}
