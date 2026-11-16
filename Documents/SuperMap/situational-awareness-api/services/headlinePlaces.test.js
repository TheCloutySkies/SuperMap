const test = require('node:test')
const assert = require('node:assert/strict')
const { pickHeadlinePlace } = require('./headlinePlaces')

const HEADLINE = 'Ukraine strikes Crimea bridge as Zelensky says Starshield caps helping Russian attacks.'

test('a Crimea bridge strike lands on the bridge, not the middle of Ukraine', () => {
  const place = pickHeadlinePlace(HEADLINE)
  assert.equal(place.label, 'Crimean Bridge')
  assert.ok(Math.abs(place.lat - 45.3086) < 0.01)
  assert.ok(Math.abs(place.lon - 36.5061) < 0.01)
  assert.equal(place.explicit, true)
  assert.doesNotMatch(place.reasoning, /stood out/i)
})

test('the country doing the striking does not beat the place that was struck', () => {
  const place = pickHeadlinePlace('US strikes Houthi sites in Yemen')
  assert.equal(place.label, 'Yemen')
})

test('Crimea is the peninsula, not a hamlet in another country', () => {
  const place = pickHeadlinePlace('Power cut across Crimea')
  assert.equal(place.label, 'Crimea')
  assert.equal(place.country, 'Ukraine')
  assert.ok(place.lat > 44 && place.lat < 46)
  assert.ok(place.lon > 32 && place.lon < 37)
})

test('a city beats the country named beside it', () => {
  const place = pickHeadlinePlace('Explosion in Kharkiv, Ukraine')
  assert.equal(place.label, 'Kharkiv')
})

test('Papua New Guinea is not Guinea', () => {
  const place = pickHeadlinePlace('Flooding spreads in Papua New Guinea')
  assert.equal(place.label, 'Papua New Guinea')
})

test('a headline with no place stays empty', () => {
  assert.equal(pickHeadlinePlace('Budget talks continue tomorrow'), null)
})

test('a lowercase pronoun does not become the United States', () => {
  assert.equal(pickHeadlinePlace('Officials tell us the talks stalled'), null)
})
