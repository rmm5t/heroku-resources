import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {URL} from 'node:url'

import {comparePostgresRam, parsePostgresCatalog} from '../scripts/lib/addon-catalog.js'
import {POSTGRES_RAM_BY_PLAN} from '../src/addon-limits.js'

const CATALOG = await readFile(new URL('fixtures/postgres-catalog.html', import.meta.url), 'utf8')
const EXPECTED_RAM = new Map([
  ['standard-0', '4 GB'],
  ['premium-l-6', '122 GB'],
  ['private-4', '30.5 GB'],
  ['shield-10', '1 TB'],
  ['essential-0', 'shared'],
  ['essential-1', 'shared'],
  ['essential-2', 'shared'],
])

test('extracts classic RAM and the displayed Essential RAM instead of the JSON placeholder', () => {
  const upstream = parsePostgresCatalog(CATALOG)
  assert.deepEqual(upstream, EXPECTED_RAM)
  assert.deepEqual(comparePostgresRam(EXPECTED_RAM, upstream), [])
  for (const [name, ram] of upstream) assert.equal(POSTGRES_RAM_BY_PLAN.get(name), ram)
})

test('accepts reordered attributes, extra classes, and insignificant RAM formatting changes', () => {
  const html = CATALOG
    .replaceAll('type="application/json" class="postgres-plans-data" data-dialog="classic"',
      "data-dialog='classic' class='extra postgres-plans-data' type='application/json'")
    .replace('"4 GB"', '"4.0gb"')
    .replace('> Shared</div>', '> <strong>Shared</strong>&nbsp;</div>')
  assert.deepEqual(parsePostgresCatalog(html), EXPECTED_RAM)
})

test('reports changed allocations including Essential changing from shared to dedicated RAM', () => {
  const upstream = parsePostgresCatalog(CATALOG.replace('"4 GB"', '"8 GB"').replace('> Shared</div>', '> 512 MB</div>'))
  assert.deepEqual(comparePostgresRam(EXPECTED_RAM, upstream), [
    'essential-0: local shared, upstream 512 MB',
    'standard-0: local 4 GB, upstream 8 GB',
  ])
})

test('reports new plans and plans missing upstream', () => {
  const upstream = parsePostgresCatalog(CATALOG.replace('Standard 0', 'Standard 11').replaceAll('Essential 2', 'Essential 3'))
  assert.deepEqual(comparePostgresRam(EXPECTED_RAM, upstream), [
    'essential-2: missing upstream (local shared)',
    'essential-3: missing locally (upstream shared)',
    'standard-0: missing upstream (local 4 GB)',
    'standard-11: missing locally (upstream 4 GB)',
  ])
})

test('rejects missing or duplicated catalog JSON blocks', () => {
  for (const html of [
    '<html>Service temporarily unavailable</html>',
    CATALOG.replace('data-dialog="classic"', 'data-dialog="changed"'),
    CATALOG.replace('data-dialog="essential"', 'data-dialog="changed"'),
    CATALOG + '<script type="application/json" class="postgres-plans-data" data-dialog="classic">[]</script>',
  ]) {
    assert.throws(() => parsePostgresCatalog(html), /Expected one .* Postgres plan catalog JSON block/)
  }
})

test('rejects invalid JSON, empty catalogs, and unexpected catalog data', () => {
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('"4 GB"', 'not-json')), /Unable to parse classic/)
  for (const data of ['[]', '{}', 'null']) {
    const html = CATALOG.replace(/(<script[^>]*data-dialog="classic">)[\s\S]*?<\/script>/, `$1${data}</script>`)
    assert.throws(() => parsePostgresCatalog(html), /must be a non-empty array/)
  }
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('"Standard 0"', 'null')), /Invalid classic Postgres plan name/)
})

test('rejects missing, invalid, or duplicated RAM data rather than skipping entries', () => {
  for (const value of ['null', '""', '"0 Bytes"', '"0 GB"', '"4 widgets"']) {
    assert.throws(() => parsePostgresCatalog(CATALOG.replace('"4 GB"', value)), /Missing or invalid RAM.*standard-0/)
  }
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('"memory_in_gb": "4 GB"', '"renamed": "4 GB"')), /Missing or invalid RAM/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('Premium L 6', 'Standard 0')), /Duplicate Postgres catalog plan/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('> Shared</div>', '> Unknown</div>')), /Missing or invalid RAM.*essential-0/)
})

test('rejects missing or inconsistent Essential pricing rows', () => {
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('postgres-essential-panel', 'renamed-panel')), /Unable to find the Essential/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replaceAll('postgres-row', 'renamed-row')), /No Essential Postgres pricing rows/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('col-memory', 'renamed-memory')), /Expected one col-memory field/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('>Essential 0<', '>Essential 1<')), /Duplicate Essential Postgres pricing row/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('>Essential 0<', '>Essential 3<')), /Missing Essential Postgres pricing row/)
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('"Essential 0"', '"Essential 1"')), /Duplicate Postgres catalog plan/)
  const extra = '<div class="postgres-row"><span class="plan-name">Essential 3</span><div class="col-memory">Shared</div></div>'
  assert.throws(() => parsePostgresCatalog(CATALOG.replace('</section>', `${extra}</section>`)), /pricing rows do not match/)
})

test('checker exits unsuccessfully on drift, extraction failures, and HTTP errors without network access', () => {
  const script = new URL('../scripts/check-addon-limits.js', import.meta.url).href
  for (const [response, html, error] of [
    [{ok: true}, CATALOG, /missing upstream/],
    [{ok: true}, '<html></html>', /Expected one classic/],
    [{ok: false, status: 503, statusText: 'Service Unavailable'}, '', /Unable to fetch Heroku Postgres catalog: 503/],
  ]) {
    const code = `globalThis.fetch = async () => ({...${JSON.stringify(response)}, text: async () => ${JSON.stringify(html)}}); await import(${JSON.stringify(script)});`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {encoding: 'utf8', timeout: 5000})
    assert.ifError(result.error)
    assert.equal(result.status, 1)
    assert.match(result.stderr, error)
    assert.doesNotMatch(result.stdout, /allocations match/)
  }
})
