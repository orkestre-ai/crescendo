import type { ReportDefinitionSeed } from './index';

/**
 * The year-end giving review: last year's year-end, its two peak days hour
 * by hour, this campaign against last year, search and AI assistants, the
 * donation forms and money without a source, led by the five findings most
 * worth acting on before the next peak day.
 *
 * The prompt says what to analyse, what to doubt and what the document
 * holds. How the ledger, the blocks and the recheck work is the runner's
 * preamble, not this prompt's business.
 */
export const yearEndGivingReview: ReportDefinitionSeed = {
  key: 'year-end-giving-review',
  name: 'Year-end giving review',
  description:
    "Last year's year-end, its peak days hour by hour, this campaign against last year, search and AI assistants, donation forms and money without a source, with five things to check before the next peak day.",
  inputs: [
    {
      key: 'campaignStart',
      label: "This year's campaign start date",
      type: 'date',
      required: true,
      default: '{{year}}-11-15',
      help: 'The first day of this year-end campaign. 15 November if you are not sure.',
    },
    {
      key: 'givingTuesday',
      label: 'Giving Tuesday this year',
      type: 'date',
      required: true,
      help: 'The Tuesday after the fourth Thursday of November: 1 December 2026, 30 November 2027.',
    },
    {
      key: 'givingTuesdayLastYear',
      label: 'Giving Tuesday last year',
      type: 'date',
      required: true,
      help: '2 December 2025, 1 December 2026.',
    },
    {
      key: 'donationForm',
      label: 'Main donation form address, this year',
      type: 'text',
      required: false,
      help: 'The path of the form, such as /page/12345/donate/1. Leave blank and the review uses the donation page with the most gifts.',
    },
    {
      key: 'donationFormLastYear',
      label: 'Main donation form address, last year',
      type: 'text',
      required: false,
      help: 'Leave blank if it was the same form.',
    },
    {
      key: 'trackingChanges',
      label: 'Known tracking changes',
      type: 'textarea',
      required: false,
      help: 'Anything that changed how visits or gifts are recorded, with its date: a new consent banner, a new form, a change of tagging. One per line.',
    },
  ],
  prompt: `Prepare a year-end giving review of the whole website for {{organizationName}}, from its Google Analytics 4 (GA4) property. The reader is a fundraiser, not an analyst, and may send it on. It has to be accurate enough to send, so doubting your own findings is part of the job, not an extra.

INPUTS
- Organisation: {{organizationName}}
- Prepared by: {{preparedBy}}
- This year's campaign started: {{campaignStart}}
- Giving Tuesday this year: {{givingTuesday}}
- Giving Tuesday last year: {{givingTuesdayLastYear}}
- Main donation form address, this year: {{donationForm}}
- Main donation form address, last year: {{donationFormLastYear}}
- Tracking changes the organisation knows about: {{trackingChanges}}

A blank form address this year means: use the donation page with the most gifts. A blank address last year means the same form as this year. Blank tracking changes means none were reported. If the organisation is blank, read the site's name from a hostName report and use that.

DATES
- "This year" is the year of the campaign start date. "Last year" is the year before it, and "the year before" is the one before that. Every date is a day in the property's time zone, {{timeZone}}.
- Last year's year-end is 15 November to 31 December last year. Compare it with the same dates the year before. Fixed dates stay fixed: 31 December is compared with 31 December.
- Giving Tuesday is the Tuesday after the fourth Thursday of November: 3 December 2024, 2 December 2025, 1 December 2026, 30 November 2027. Compare Giving Tuesday with Giving Tuesday, whatever its date.
- A peak day (Giving Tuesday, 31 December) is compared across the two most recent years in which that day is complete.
- The campaign so far runs from the campaign start date to the last full day. Compare it with the same weekdays last year: the dates exactly 364 days earlier.
- "The last 90 days" ends on the last full day.

RULES THAT APPLY THROUGHOUT
- Use purchaseRevenue for gift amounts whenever the donation event has it. eventValue adds currencies together without converting them, so do not use it for money unless the donation event has no purchaseRevenue, and then say the totals may mix currencies.
- Never filter a whole report to the donation event to get a conversion rate: that filters the sessions too. Use the metric keyEvents:<event name>, or two reports combined.
- Conversion rate: lead with the donation-page rate (gifts divided by sessions that reached a donation page). Give the site-wide rate second. Do not use GA4's key event rate if other key events exist.
- Sessions and users do not add up across days, hours or pages. Take the total sessions or users for a period from a report without that dimension (by dateRange or channel is fine), not from the daily rows.
- Keep reports small: only the dimensions and metrics you need, sorted, with a row limit. Get daily totals first, then break down only the days that matter. Expect 40 to 60 reports in all.
- To compare two periods, ask for both date ranges in one report and name them. In a dataset, join the query to itself with a "where" on dateRange to put the periods side by side, and add the change as a computed column.
- Hours are in the property's time zone. If most donors are plainly in another one, say so, and convert the hours that matter, such as the midnight deadline on 31 December.
- If the tracking changes above, or the data, show that tracking changed part-way through a period, say the comparison across it is unfair, in a flag block where it applies. GA4's own changes count too: the "AI Assistant" channel now takes visits that used to be Referral or Unassigned.
- Never show transaction IDs, email addresses or anything else personal.

STEP 1: CHECK THE PROPERTY
Report sessions per day for the last 7 full days. If there are no rows, or sessions fall to almost nothing, find the last normal day (sessions by month for three years, then by day around the drop) and call needs_attention with what you found. Do not go on with a broken property.

STEP 2: FIND OUT HOW GIFTS ARE TRACKED
- Report eventName with eventCount and purchaseRevenue for the last 90 days. Decide which event records gifts from its count and its revenue. Do not rely on a list of key events: GA4 marks purchase as a key event on every property, whether or not gifts use it.
- If the donation event is purchase: gifts are transactions and money is purchaseRevenue. Also report it by itemCategory and itemName, to see whether monthly gifts are marked.
- Otherwise gifts are keyEvents:<event name>. If that event is not a key event, or carries no revenue, say what that means for the figures.
- If you find no donation event, call needs_attention. The review cannot be made without one.
- Report pagePathPlusQueryString with screenPageViews for the last 90 days, the 250 most viewed, then again for addresses containing "@", "%40" or "email=". Crescendo removes email addresses before you see them and counts them. Note any malformed link, such as a doubled "??".

STEP 3: THE ANALYSIS
Record every figure you might use as you go.
a. Last year's year-end. Daily revenue, gifts and sessions for 15 November to 31 December last year, and for the same dates the year before. Totals, the average gift, Giving Tuesday's share, and the share that came in on 29 to 31 December. Revenue and gifts by sessionDefaultChannelGroup for both years.
b. Peak days, hour by hour. For Giving Tuesday and for 31 December, revenue and gifts by hour in each of the two years compared, as running totals. Use the hour dimension (00 to 23, which sorts correctly as text) and keep it as text, so a total row never adds the hours up. Include sessions so a quiet hour still has a row. Note when one year pulled ahead and any unusual hour.
c. This campaign so far against the same weekdays last year: sessions, gifts and revenue by sessionDefaultChannelGroup, and by deviceCategory.
d. Search and AI assistants. Organic Search sessions, gifts and revenue for December last year against December the year before. AI assistants are sessions whose sessionSource contains chatgpt, openai, perplexity, gemini, copilot or claude, in any channel; leave out lookalike sites. Say whether an "AI Assistant" channel appears in the channel reports.
e. Donation forms. A funnel on the main form for the last 90 days, broken down by deviceCategory: viewed the form, started it (form_start, or whatever event exists), gave. Filter funnel steps on the event parameter page_location, not on pagePath. Then sessions, gifts and revenue by landingPage and deviceCategory for the donation pages with the most gifts.
f. Money without a source. Revenue and gifts by channel for the last 90 days, and the share that is Direct, Unassigned or (not set). If the Email channel is small, say that email links probably lack UTM tags.

STEP 4: DOUBT YOUR FINDINGS
Do all three.
- For every change of more than 15% you plan to report, report transactionId with purchaseRevenue, the 5 largest, for both periods. Say how much of the change those gifts explain, and give the change without them.
- For every finding that bears on where money or effort goes, check the same result over the whole of last year's year-end. If the short period and the long one disagree, say so, and do not lean on the short one.
- List anything that looks broken: malformed links, a campaign or channel that fell to nothing, a large share of gifts with no landing page. Say how many sessions or gifts each one touches.

When the analysis is done and before you build the document, write one note for the person following the run: the donation event you found, the five findings you will lead with, and anything that stopped you or that you could not check. Then carry on.

THE DOCUMENT
Build it from these blocks, in this order. Where a part has nothing to show, say so in one sentence; do not leave it out.
1. report_header. organisation "{{organizationName}}", reportName "Year-end giving review", the headline finding as the title, the day it was prepared, {{preparedBy}}, the time zone and the currency. The dek says in one sentence what "gifts" means here.
2. section "Five things to look at before the next peak day", then priority_cards with five cards, ranked by the money at stake and how soon it matters. Each card: a plain heading that states the finding, two or three sentences with the figures and their dates, and a "Worth checking" line saying what a person should do or ask.
3. section "Last year's year-end". stat_tiles with the four headline figures, each with its change on the year before. A bar_chart of revenue by day, with Giving Tuesday and 31 December named. A data_table by channel.
4. section "Giving Tuesday and 31 December, hour by hour". One line_chart with two panels, the running totals of the two years on each day. Under it, prose on what they suggest as targets this year at 9am, noon, 6pm and midnight.
5. section "This campaign against last year". A data_table by channel and one by device, each followed by a sentence on what changed and why it might have.
6. section "Search and AI assistants".
7. section "Donation forms". funnel_steps by device, then a data_table by landing page.
8. section "Money without a source", with an example of a tagged link: ?utm_source=newsletter&utm_medium=email&utm_campaign=yearend
9. section "About these figures", then a definition_list: what is counted as a gift; the currency and time zone; whether monthly gifts are marked; tracking and channel changes; which reports GA4 sampled or thresholded, and what share was read; which lists were cut off; personal data, "Crescendo removed {{fig:emails_removed}} email addresses from query results before the analysis read them"; which figures are stated and so were not checked by a query; and how this was made: an AI assistant ran the analysis with read-only access, Crescendo computed every figure and ran every query a second time, and totals should be checked against the fundraising database before the report is shared.

Use a flag block beside any chart or table that rests on sampled, thresholded or cut-off data, or that spans a tracking change.

WRITING
- Plain English and short sentences. Name a thing in words before giving its code or its address.
- Every claim has its figure and its dates.
- Treat advice as input for a person to weigh. Never say what to spend.
- Do not say that every figure matched on the second run: you write before it happens. If you are given a turn to revise, say in "About these figures" which figures were corrected.`,
  enabledTools: ['ga4_report', 'ga4_funnel'],
  maxSteps: 500,
  maxMinutes: 120,
  enabled: true,
};
