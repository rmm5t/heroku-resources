import {POSTGRES_PLANS_SOURCE, POSTGRES_RAM_BY_PLAN} from '../src/addon-limits.js'
import {comparePostgresRam, parsePostgresCatalog} from './lib/addon-catalog.js'

const response = await fetch(POSTGRES_PLANS_SOURCE, {signal: AbortSignal.timeout(30_000)})
if (!response.ok) throw new Error(`Unable to fetch Heroku Postgres catalog: ${response.status} ${response.statusText}`)

const upstream = parsePostgresCatalog(await response.text())
const differences = comparePostgresRam(POSTGRES_RAM_BY_PLAN, upstream)
if (differences.length > 0) {
  console.error('Add-on RAM allocations differ from the Heroku Postgres catalog:')
  console.error(differences.map((difference) => `  ${difference}`).join('\n'))
  process.exitCode = 1
} else {
  console.log(`Add-on RAM allocations match the Heroku Postgres catalog for ${upstream.size} plans.`)
}
