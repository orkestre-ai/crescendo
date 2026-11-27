import type { ReportDefinitionSeed } from './index';

/**
 * The daily year-end report: the campaign so far against the same weekdays
 * last year, yesterday against the same weekday, pace, and where visits and
 * gifts came from. Engaging Networks gives the money and GA4 the traffic. It
 * runs itself each morning on data through yesterday, so it is kept short:
 * five queries and a fixed document.
 */
export const yearEndDaily: ReportDefinitionSeed = {
  key: 'year-end-daily',
  name: 'Daily year-end report',
  description:
    'Each morning: the campaign so far and yesterday against the same weekdays last year, pace to 31 December, and where visits and gifts came from.',
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
      key: 'campaignEnd',
      label: "This year's campaign end date",
      type: 'date',
      required: true,
      default: '{{year}}-12-31',
    },
    {
      key: 'givingTuesday',
      label: 'Giving Tuesday this year',
      type: 'date',
      required: false,
      help: 'Leave blank to use the Tuesday after the fourth Thursday of November.',
    },
    {
      key: 'givingTuesdayLastYear',
      label: 'Giving Tuesday last year',
      type: 'date',
      required: false,
      help: 'Leave blank to use the Tuesday after the fourth Thursday of November last year.',
    },
  ],
  prompt: `Prepare the daily year-end report for {{organizationName}}: how the year-end campaign stands this morning against the same weekdays last year. The reader is a fundraiser checking it over coffee. Keep it short and fast: five queries, then the document.

INPUTS
- Campaign: {{campaignStart}} to {{campaignEnd}}
- Giving Tuesday this year: {{givingTuesday}}
- Giving Tuesday last year: {{givingTuesdayLastYear}}
- Prepared by: {{preparedBy}}

A blank Giving Tuesday is the Tuesday after the fourth Thursday of November: 3 December 2024, 2 December 2025, 1 December 2026, 30 November 2027, 28 November 2028. If the organisation is blank, leave it out of the header.

DATES
- "The last full day" is the one given in your first message. The campaign so far runs from {{campaignStart}} to the last full day, or to {{campaignEnd}} if that is earlier. If the last full day is before {{campaignStart}}, call needs_attention at once: the campaign has not started, and the daily time can be cleared in AI Config until it does.
- The same weekdays last year are the dates exactly 364 days earlier: the campaign so far shifted back 364 days, and yesterday's same weekday is the last full day less 364 days.
- The rest of last year's season runs from the day after the shifted campaign so far to {{campaignEnd}} one year earlier (the same calendar date: 31 December stays 31 December). Once the campaign has ended there is no rest of the season.

THE QUERIES
Run these five together, in one turn. Name the date ranges as given.
1. en_fundraising, dimensions nthDay and date, metrics totalAmount and donationCount, ranges this_year (the campaign so far) and last_year (the same weekdays last year). One row per day; nthDay lines the two years up.
2. en_fundraising, no dimensions, metrics totalAmount, donationCount and recurringAmount, ranges this_year, last_year and, while the campaign runs, last_year_rest (the rest of last year's season).
3. ga4_report, no dimensions, metrics sessions, transactions and purchaseRevenue, ranges yesterday (the last full day only) and this_year.
4. ga4_report, dimension sessionDefaultChannelGroup, the same metrics and ranges, sorted by sessions, largest first.
5. ga4_report, dimension deviceCategory, the same metrics and ranges.

RULES
- Money and gifts come from Engaging Networks (queries 1 and 2). GA4 is for visits and for where gifts came from, which Engaging Networks cannot tell.
- The monthly figures include every monthly charge in the period, existing donors' as well as new sign-ups. Say so wherever monthly giving appears.
- A day listed in missingDays is unknown, not zero. Name those days in a flag and do not compare across them as if they were complete.
- Sessions do not add up across channels or devices. Total sessions come from query 3, as a cell; the channel and device tables show each row's own sessions and no total row.
- If GA4 shows no purchaseRevenue for the campaign so far, the property records gifts some other way: say so in one sentence and leave out the GA4 share.
- Work in few turns: record the figures you need together, and add blocks one after another without extra checks.

THE FIGURES
From query 2: raised, gifts and monthly amount for this_year and last_year, and last_year_rest; from these, the average gift (raised / gifts) and the monthly share (monthly amount / raised) for both years, and the change in each of the four (this year less last year, over last year). Pace is this_year raised plus last_year_rest raised, labelled as a projection. From query 1: yesterday's raised and gifts, and the same for its same weekday last year, with their changes. Days until Giving Tuesday and until {{campaignEnd}}: stated figures, unit count, reason "counted on the calendar". If Giving Tuesday has passed, take its raised and gifts this year and last year from query 1 instead. From query 3: sessions and purchaseRevenue for this_year; the GA4 share is that purchaseRevenue over Engaging Networks this_year raised.

THE DATASETS
- running: from query 1 where dateRange is this_year, select date and totalAmount as this_year (currency); join query 1 on nthDay where dateRange is last_year, select totalAmount as last_year (currency); cumulative this_year and last_year; sorted by date.
- days: the same rows and join, newest first, with this year's gifts, last year's date as last_year_date, last year's gifts, and the change in raised as a computed percent column.
- channels and devices: from query 4 (and 5) where dateRange is this_year, select the channel (device), sessions, transactions and purchaseRevenue; join the same query on the channel (device) where dateRange is yesterday, select sessions and purchaseRevenue as yesterday's.

THE DOCUMENT
These blocks, in this order:
1. report_header. organisation "{{organizationName}}", reportName "Daily year-end report", the headline (raised so far against the same weekdays last year) as the title, today's date written out, {{preparedBy}}, the time zone and the currency. The dek: "Engaging Networks giving from <campaign start> to <last full day>, against the same weekdays last year. Data through <last full day>."
2. flag, only if a query listed missingDays: the days, and that they are unknown, not zero.
3. stat_tiles with four tiles: raised so far, gifts, average gift and monthly share, each with last year's figure and the change. previousLabel is last year's year.
4. section "Yesterday", then stat_tiles with two tiles: raised and gifts on the last full day, against its same weekday last year, with the change.
5. section "Day by day". A line_chart, one panel, x date, xKind date, lines this_year and last_year from the running dataset, titled "Raised so far". Then a data_table of the days dataset, the date columns with kind date and the change with kind change.
6. section "Pace". prose: what the campaign would reach if the rest of the season went as last year's did, {{fig:<pace>}}, called a projection, not a forecast; then days until Giving Tuesday and until the campaign ends. Once Giving Tuesday has passed, give its raised and gifts against Giving Tuesday last year instead of the days until it.
7. section "Where visits and gifts came from". A data_table by channel and one by device, campaign so far with yesterday beside it. Then one prose sentence: GA4 recorded {{fig:<share>}} of the money Engaging Networks recorded for the campaign so far; the rest is gifts GA4 did not see.
8. section "Worth looking at today", then priority_cards with one to three cards: what stands out this morning against last year, each with its figures, its dates and a "Worth checking" line. If nothing stands out, one card saying so.
9. definition_list "About these figures": money and gifts are from Engaging Networks; monthly giving includes existing donors' charges; "same weekdays last year" means 364 days earlier; visits and sources are from GA4, which misses some gifts; an AI assistant prepared this with read-only access, Crescendo computed every figure and ran every query a second time.

WRITING
- Plain English and short sentences. Every claim has its figure and its dates.
- Advice is for a person to weigh. Never say what to spend.`,
  enabledTools: ['en_fundraising', 'ga4_report'],
  maxSteps: 60,
  maxMinutes: 20,
  enabled: true,
  scheduleDailyAt: '07:00',
};
