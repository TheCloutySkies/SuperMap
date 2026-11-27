#!/usr/bin/env node
/**
 * The news desk must show one row per story.
 *
 *   node scripts/test-story-dedupe.mjs
 *
 * The fixtures are the real shapes the desk receives: an outlet item, the same
 * article mirrored through Google News with " - Outlet" on the title, the same
 * copy fetched by two feeds (BBC and BBC World), and two genuinely different
 * stories that happen to share a country.
 */
import {
  dedupeStories,
  sameStoryTokens,
  storyTokens,
  storyTitleKey,
} from '../src/lib/storyDedupe.js'

let failures = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
}

function item(source, title, link, extra = {}) {
  return { source, title, link, pubDate: '2026-11-27T02:30:00Z', ...extra }
}

console.log('\n1. outlet copy and its Google News mirror')
const mirror = dedupeStories([
  item('Google News — conflict', 'Zelenskyy warns of major Russian attack as Trump urges Putin to ‘pull back’ - Al Jazeera', 'https://news.google.com/rss/articles/CBMi1'),
  item('Al Jazeera', 'Zelenskyy warns of major Russian attack as Trump urges Putin to ‘pull back’', 'https://www.aljazeera.com/news/2026/11/27/zelenskyy-warns'),
])
check('one row', mirror.length === 1, String(mirror.length))
check('the outlet keeps the row, not the mirror', mirror[0].source === 'Al Jazeera', mirror[0].source)

console.log('\n2. the same copy fetched by two feeds')
const twoFeeds = dedupeStories([
  item('BBC World', 'Two Italians killed in strike in Kuwait, as Iran denies responsibility', 'https://www.bbc.com/news/articles/c1'),
  item('BBC', 'Two Italians killed in strike in Kuwait, as Iran denies responsibility', 'https://www.bbc.co.uk/news/articles/c1'),
])
check('one row', twoFeeds.length === 1, String(twoFeeds.length))

console.log('\n3. the same page re-headlined')
const reheadlined = dedupeStories([
  item('The Guardian', 'New Zealand election: final results show ruling coalition needs minor party to govern', 'https://www.theguardian.com/world/2026/nov/27/nz-election'),
  item('Google News — politics', 'New Zealand election result: coalition needs a partner', 'https://www.theguardian.com/world/2026/nov/27/nz-election?utm_source=rss&utm_medium=feed'),
])
check('one row for one link', reheadlined.length === 1, String(reheadlined.length))

console.log('\n4. two different stories about the same country')
const distinct = dedupeStories([
  item('BBC World', "New Zealand's ruling coalition falls short of parliamentary majority by one seat", 'https://www.bbc.com/news/a1'),
  item('The Guardian', "Threat from China looms large over Taiwan's local elections", 'https://www.theguardian.com/world/b2'),
  item('Al Jazeera', 'Trump says the US has ‘close to 50%’ of world’s oil', 'https://www.aljazeera.com/economy/c3'),
])
check('every row survives', distinct.length === 3, String(distinct.length))
check(
  'a shared country name alone never groups two stories',
  sameStoryTokens(storyTokens('New Zealand quake hits South Island'), storyTokens('New Zealand election ends in deadlock')) === false,
)

console.log('\n5. the order does not move')
const ordered = dedupeStories([
  item('Reuters', 'Oil slips as traders weigh supply', 'https://www.reuters.com/oil1'),
  item('NPR', 'Storms disrupt Thanksgiving travel', 'https://www.npr.org/st1'),
  item('Reuters (Google News)', 'Oil slips as traders weigh supply - Reuters', 'https://news.google.com/rss/articles/oil1'),
])
check('two rows', ordered.length === 2, String(ordered.length))
check('the surviving copy stays where the story first appeared', ordered[0].link.includes('reuters.com'), ordered[0].link)

console.log('\n6. the richer copy is the one kept')
const richer = dedupeStories([
  { source: 'BBC World', title: 'Major Thanksgiving storm brings flooding, flight delays', link: 'https://www.bbc.com/news/w1', pubDate: '2026-11-27T02:00:00Z' },
  { source: 'BBC', title: 'Major Thanksgiving storm brings flooding, flight delays', link: 'https://www.bbc.co.uk/news/w1', pubDate: '2026-11-27T02:05:00Z', image: 'https://ichef.bbci.co.uk/news/w1.jpg', description: 'A long, illustrated report about the storm and its delays across the country.' },
])
check('one row', richer.length === 1, String(richer.length))
check('the copy with the picture and the report text is kept', !!richer[0].image, JSON.stringify(richer[0]).slice(0, 120))

console.log('\n7. titles and tokens')
check(
  'the outlet tail is part of the mirror, not the headline',
  storyTitleKey('Oil slips as traders weigh supply - Reuters') === 'oil slips as traders weigh supply',
  storyTitleKey('Oil slips as traders weigh supply - Reuters'),
)
check(
  'a plural and its singular are the same word',
  storyTokens('Storms hit the coast').has('storm'),
  [...storyTokens('Storms hit the coast')].join(','),
)

console.log('\n8. an empty desk stays empty')
check('nothing in, nothing out', dedupeStories([]).length === 0)
check('null is tolerated', dedupeStories(null).length === 0)

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
