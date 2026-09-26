import assert from 'node:assert/strict'
import test from 'node:test'

import {fetchPipelineResources} from '../src/api.js'

class FakeClient {
  calls = []

  constructor(pipelines, responses = {}) {
    this.pipelines = pipelines
    this.responses = responses
  }

  async request(path, options) {
    this.calls.push(['request', path, options])
    return {body: this.pipelines}
  }

  async get(path, options) {
    this.calls.push(['get', path, options])
    const responses = {
      '/pipelines/pipeline-id/pipeline-couplings': [
        {app: {id: 'production-id'}, stage: 'production'},
        {app: {id: 'staging-id'}, stage: 'staging'},
      ],
      '/apps/staging-id': {id: 'staging-id', name: 'staging-app'},
      '/apps/staging-id/addons': [],
      '/apps/staging-id/dynos': [{size: 'Basic', state: 'up', type: 'web'}],
      '/apps/staging-id/formation': [{quantity: 1, size: 'Basic', type: 'web'}],
      '/dyno-sizes': [{compute: 1, memory: 0.5, name: 'Basic'}],
      ...this.responses,
    }
    if (!(path in responses)) throw new Error(`Unexpected API path: ${path}`)
    return {body: responses[path]}
  }
}

test('finds a pipeline and only fetches apps coupled to the requested stage', async () => {
  const client = new FakeClient([{id: 'pipeline-id', name: 'example'}])
  const result = await fetchPipelineResources(client, 'example', 'staging')

  assert.equal(result.pipeline.name, 'example')
  assert.deepEqual(result.apps.map(({app}) => app.name), ['staging-app'])
  assert.deepEqual(result.apps[0].addons, [])
  assert.deepEqual(result.dynoSizes, [{compute: 1, memory: 0.5, name: 'Basic'}])
  assert.ok(client.calls.some(([, path]) => path === '/pipelines?eq[name]=example'))
  assert.ok(client.calls.every(([, path]) => !path.includes('production-id')))
  assert.deepEqual(client.calls.find(([, path]) => path === '/apps/staging-id/addons')[2], {
    headers: {
      Accept: 'application/vnd.heroku+json; version=3.sdk',
      'Accept-Expansion': 'addon_service,plan',
    },
  })
})

test('enriches add-ons with service limits using the Postgres ID and Key-Value Store name', async () => {
  const pgUrl = 'https://postgres-api.heroku.com/client/v11/databases/pg-id'
  const redisUrl = 'https://api.data.heroku.com/redis/v0/databases/redis-example'
  const client = new FakeClient([{id: 'pipeline-id', name: 'example'}], {
    '/apps/staging-id/addons': [
      {addon_service: {name: 'heroku-postgresql'}, id: 'pg-id', name: 'postgresql-example'},
      {addon_service: {name: 'heroku-redis'}, id: 'redis-id', name: 'redis-example'},
      {addon_service: {name: 'appsignal'}, id: 'appsignal-id', name: 'appsignal-example'},
    ],
    [pgUrl]: {
      plan: 'essential-1',
      info: [
        {name: 'Status', values: ['Upgrading Plan: Replacing Primary, Maintenance Scheduled']},
        {name: 'Connections', values: ['4/20']},
        {name: 'Data Size', values: ['1 GB / 10 GB (10%)']},
      ],
      resource_url: 'must-not-be-retained',
      database_password: 'private',
    },
    [redisUrl]: {
      plan: 'premium-2',
      info: [
        {name: 'Status', values: ['available']},
        {name: 'Plan Connection Limit', values: [200]},
        {name: 'Maxmemory', values: ['250 MB']},
      ],
    },
  })
  const result = await fetchPipelineResources(client, 'example', 'staging')

  assert.deepEqual(result.apps[0].addons.map((addon) => addon.limits), [
    {diskSize: '10 GB', maxConnections: 20, ram: 'shared'},
    {diskSize: null, maxConnections: 200, ram: '250 MB'},
    {diskSize: null, maxConnections: null, ram: null},
  ])
  assert.deepEqual(result.apps[0].addons.map(({activePlan, providerStatus}) => ({activePlan, providerStatus})), [
    {activePlan: 'Essential 1', providerStatus: 'Upgrading Plan: Replacing Primary, Maintenance Scheduled'},
    {activePlan: 'Premium 2', providerStatus: 'available'},
    {activePlan: null, providerStatus: null},
  ])
  assert.doesNotMatch(JSON.stringify(result), /must-not-be-retained|private/)
  assert.deepEqual(client.calls.filter(([, path]) => path.startsWith('https://')), [
    ['get', pgUrl, {retryAuth: false, timeout: 10_000}],
    ['get', redisUrl, {retryAuth: false, timeout: 10_000}],
  ])
})

test('reports a missing pipeline', async () => {
  const client = new FakeClient([])

  await assert.rejects(
    fetchPipelineResources(client, 'missing', 'production'),
    /Pipeline not found: missing/,
  )
})

test('requires an ID when a pipeline name is ambiguous', async () => {
  const client = new FakeClient([
    {id: 'first-id', name: 'example'},
    {id: 'second-id', name: 'example'},
  ])

  await assert.rejects(
    fetchPipelineResources(client, 'example', 'production'),
    /Multiple pipelines are named example.*first-id, second-id/,
  )
})

test('accepts a pipeline ID', async () => {
  const pipelineId = '4ac75747-86f1-445d-81f7-2bab424a5b76'
  const calls = []
  const client = {
    async get(path) {
      calls.push(['get', path])
      return {body: []}
    },
    async request(path) {
      calls.push(['request', path])
      return {body: {id: pipelineId, name: 'example'}}
    },
  }

  const result = await fetchPipelineResources(client, pipelineId, 'production')

  assert.equal(result.pipeline.name, 'example')
  assert.deepEqual(result.apps, [])
  assert.deepEqual(calls.map(([, path]) => path), [
    `/pipelines/${pipelineId}`,
    `/pipelines/${pipelineId}/pipeline-couplings`,
    '/dyno-sizes',
  ])
})
