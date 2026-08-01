import {COST_MONTHLY, DYNO_COSTS_SOURCE} from '../src/specs.js'

const response = await fetch(DYNO_COSTS_SOURCE)
if (!response.ok) throw new Error(`Unable to fetch Heroku CLI dyno costs: ${response.status} ${response.statusText}`)

const source = await response.text()
const block = source.match(/const COST_MONTHLY[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1]
if (!block) throw new Error('Unable to find COST_MONTHLY in the Heroku CLI source')

const upstreamCosts = {}
for (const line of block.split('\n')) {
  const match = line.match(/^\s*(?:'([^']+)'|"([^"]+)"|([a-zA-Z][a-zA-Z0-9]*)):\s*(\d+),?\s*$/)
  if (!match) continue

  upstreamCosts[match[1] ?? match[2] ?? match[3]] = Number.parseInt(match[4], 10)
}

const differences = []
const names = new Set([...Object.keys(COST_MONTHLY), ...Object.keys(upstreamCosts)])
for (const name of [...names].sort()) {
  if (!(name in COST_MONTHLY)) differences.push(`${name}: missing locally (upstream $${upstreamCosts[name]})`)
  else if (!(name in upstreamCosts)) differences.push(`${name}: missing upstream (local $${COST_MONTHLY[name]})`)
  else if (COST_MONTHLY[name] !== upstreamCosts[name]) {
    differences.push(`${name}: local $${COST_MONTHLY[name]}, upstream $${upstreamCosts[name]}`)
  }
}

if (differences.length > 0) {
  console.error('Dyno cost fallback differs from Heroku CLI:')
  console.error(differences.map((difference) => `  ${difference}`).join('\n'))
  process.exit(1)
}

console.log(`Dyno cost fallback matches Heroku CLI for ${names.size} sizes.`)
