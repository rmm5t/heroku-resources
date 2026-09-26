import assert from 'node:assert/strict'
import test from 'node:test'

import {fetchAddonDetails} from '../src/addon-limits.js'

const POSTGRES = {addon_service: {name: 'heroku-postgresql'}, id: 'pg-id', name: 'postgresql-example'}
const REDIS = {addon_service: {name: 'heroku-redis'}, id: 'redis-id', name: 'redis-example'}
const UNKNOWN_LIMITS = {diskSize: null, maxConnections: null, ram: null}
const UNKNOWN_DETAILS = {activePlan: null, limits: UNKNOWN_LIMITS, providerStatus: null}

async function fetchAddonLimits(client, addon) {
  return (await fetchAddonDetails(client, addon)).limits
}

function clientWithInfo(info, plan) {
  return {
    async get() {
      return {body: {info, plan, resource_url: 'must-not-appear-in-report', database_password: 'private'}}
    },
  }
}

test('reads Postgres capacities rather than current usage or the pending plan', async () => {
  const addon = {...POSTGRES, plan: {name: 'heroku-postgresql:standard-2'}}
  const client = clientWithInfo([
    {name: 'Plan', values: ['Standard 0']},
    {name: 'Connections', values: ['33/200']},
    {name: 'Data Size', values: ['14 GB / 64 GB (21.84%)']},
  ])

  assert.deepEqual(await fetchAddonLimits(client, addon), {diskSize: '64 GB', maxConnections: 200, ram: '4 GB'})
})

test('resolves Postgres RAM from active plan identifiers across dedicated tiers', async () => {
  for (const [plan, ram] of [
    ['standard-2', '8 GB'],
    ['heroku-postgresql:standard-4', '30.5 GB'],
    ['premium-3', '15 GB'],
    ['premium-l-6', '122 GB'],
    ['private-xl-6', '122 GB'],
    ['Shield XL 9', '768 GB'],
    ['shield-10', '1 TB'],
    [{id: 123, name: 'standard-0'}, '4 GB'],
  ]) {
    const client = clientWithInfo([], plan)
    const limits = await fetchAddonLimits(client, POSTGRES)
    assert.equal(limits.ram, ram)
  }
})

test('labels Essential Postgres RAM as shared', async () => {
  for (const plan of ['essential-0', 'Essential 1', 'heroku-postgresql:essential-2']) {
    const limits = await fetchAddonLimits(clientWithInfo([], plan), POSTGRES)
    assert.equal(limits.ram, 'shared')
  }
})

test('keeps RAM unknown for unrecognized active plans instead of using the billed plan', async () => {
  const addon = {...POSTGRES, plan: {name: 'heroku-postgresql:standard-2'}}
  for (const plan of [undefined, null, {}, 'standard-1', 'standard-99', 'standard-l-6', 'premium-xl-2', 'essential-3', 'custom-2']) {
    const limits = await fetchAddonLimits(clientWithInfo([], plan), addon)
    assert.equal(limits.ram, null)
  }
})

test('reads Key-Value Store connection limits and maximum data memory', async () => {
  const client = clientWithInfo([
    {name: 'Plan Connection Limit', values: [200]},
    {name: 'Maxmemory', values: ['250 MB']},
  ])

  assert.deepEqual(await fetchAddonLimits(client, REDIS), {diskSize: null, maxConnections: 200, ram: '250 MB'})
})

test('retains the active plan and full provider status for Postgres and Key-Value Store', async () => {
  for (const [addon, plan, activePlan] of [
    [POSTGRES, {name: 'heroku-postgresql:standard-0'}, 'Standard 0'],
    [REDIS, 'premium-2', 'Premium 2'],
  ]) {
    const client = clientWithInfo([
      {name: 'Status', values: ['Upgrading Plan: Replacing Primary', 'Maintenance Scheduled']},
    ], plan)
    const details = await fetchAddonDetails(client, addon)
    assert.equal(details.activePlan, activePlan)
    assert.equal(details.providerStatus, 'Upgrading Plan: Replacing Primary, Maintenance Scheduled')
    assert.doesNotMatch(JSON.stringify(details), /resource_url|database_password|must-not-appear-in-report/)
  }
})

test('uses the displayed active plan when the service plan identifier is missing', async () => {
  for (const plan of [undefined, null, '', {}, {name: 123}]) {
    const details = await fetchAddonDetails(clientWithInfo([
      {name: 'Plan', values: ['Premium XL 6']},
      {name: 'Status', values: ['Available']},
    ], plan), POSTGRES)
    assert.equal(details.activePlan, 'Premium XL 6')
    assert.equal(details.limits.ram, '122 GB')
    assert.equal(details.providerStatus, 'Available')
  }
})

test('treats malformed plan and status metadata as unavailable', async () => {
  const details = await fetchAddonDetails(clientWithInfo([
    {name: 'Plan', values: [{}]},
    {name: 'Status', values: [null, {}, 123, ' ']},
  ], {name: {}}), POSTGRES)
  assert.deepEqual(details, UNKNOWN_DETAILS)
})

test('handles formatted connection counts, storage units, and differing usage units', async () => {
  const cases = [
    [' 12 / 1,000 ', '700 MB / 1.5 TB (0.05%)', 1000, '1.5 TB'],
    ['0/20', '0 B / 10 GB', 20, '10 GB'],
    ['0 / 500', '1 GiB / 512 GiB (0.2%)', 500, '512 GiB'],
  ]
  for (const [connections, storage, maxConnections, diskSize] of cases) {
    const client = clientWithInfo([
      {name: 'Connections', values: [connections]},
      {name: 'Data Size', values: [storage]},
    ])
    assert.deepEqual(await fetchAddonLimits(client, POSTGRES), {diskSize, maxConnections, ram: null})
  }
})

test('does not mistake usage-only or unrecognized values for capacities', async () => {
  for (const [connections, storage] of [
    ['33', '14 GB'],
    ['0/unknown', '14 GB / unknown'],
    ['0/200 clients', '14 GB / 64 widgets'],
    ['0/9007199254740992', '14 GB / unlimited'],
  ]) {
    const client = clientWithInfo([
      {name: 'Connections', values: [connections]},
      {name: 'Data Size', values: [storage]},
    ])
    assert.deepEqual(await fetchAddonLimits(client, POSTGRES), UNKNOWN_LIMITS)
  }
})

test('keeps available limits when the other capacity is missing', async () => {
  assert.deepEqual(await fetchAddonLimits(clientWithInfo([
    {name: 'Connections', values: ['0/20']},
  ]), POSTGRES), {diskSize: null, maxConnections: 20, ram: null})
  assert.deepEqual(await fetchAddonLimits(clientWithInfo([
    {name: 'Maxmemory', values: ['1 GB']},
  ]), REDIS), {diskSize: null, maxConnections: null, ram: '1 GB'})
})

test('tolerates missing or malformed service metadata', async () => {
  for (const info of [undefined, null, {}, [], [null], [
    {name: 'Plan Connection Limit', values: '200'},
    {name: 'Maxmemory', values: [{}]},
  ]]) {
    assert.deepEqual(await fetchAddonLimits(clientWithInfo(info), POSTGRES), UNKNOWN_LIMITS)
    assert.deepEqual(await fetchAddonLimits(clientWithInfo(info), REDIS), UNKNOWN_LIMITS)
  }
})

test('does not query unrelated services or add-ons without identifiers', async () => {
  const calls = []
  const client = {async get(url) { calls.push(url) }}
  for (const addon of [
    {addon_service: {name: 'appsignal'}, name: 'appsignal-example'},
    {addon_service: {name: 'heroku-postgresql'}},
    {addon_service: {name: 'heroku-redis'}},
    {},
  ]) {
    assert.deepEqual(await fetchAddonDetails(client, addon), UNKNOWN_DETAILS)
  }
  assert.deepEqual(calls, [])
})

test('treats unavailable service APIs as unknown limits', async () => {
  for (const statusCode of [401, 403, 404, 429, 503]) {
    const client = {
      async get() {
        throw Object.assign(new Error('Service unavailable'), {statusCode})
      },
    }
    assert.deepEqual(await fetchAddonDetails(client, POSTGRES), UNKNOWN_DETAILS)
    assert.deepEqual(await fetchAddonDetails(client, REDIS), UNKNOWN_DETAILS)
  }

  const client = {async get() { throw Object.assign(new Error('Timed out'), {code: 'ETIMEDOUT'}) }}
  assert.deepEqual(await fetchAddonDetails(client, POSTGRES), UNKNOWN_DETAILS)
})
