import assert from 'node:assert/strict'
import test from 'node:test'

import {formatReport} from '../src/format.js'
import {buildReport} from '../src/report.js'

const DYNO_SIZES = [
  {
    compute: 1,
    cost: {cents: 700, unit: 'monthly'},
    dedicated: false,
    generation: {name: 'cedar'},
    memory: 0.5,
    name: 'Basic',
  },
  {
    compute: 1,
    cost: {cents: 2500, unit: 'monthly'},
    dedicated: false,
    generation: {name: 'cedar'},
    memory: 0.5,
    name: 'Standard-1X',
  },
  {
    compute: 2,
    cost: {cents: 5000, unit: 'monthly'},
    dedicated: false,
    generation: {name: 'cedar'},
    memory: 1,
    name: 'Standard-2X',
  },
  {
    compute: 2,
    cost: {cents: null, unit: null},
    dedicated: true,
    generation: {name: 'cedar'},
    memory: 1,
    name: 'Shield-S',
  },
  {
    compute: 1,
    cost: {cents: 0, unit: 'monthly'},
    dedicated: false,
    generation: {name: 'cedar'},
    memory: 0.5,
    name: 'Eco',
  },
  {
    compute: 2,
    cost: {cents: null, unit: null},
    dedicated: true,
    generation: {name: 'fir'},
    memory: 8,
    name: 'dyno-2c-8gb',
  },
]

function buildTestReport(pipeline, stage, apps) {
  return buildReport(pipeline, stage, apps, DYNO_SIZES)
}

function appResources(name, dynos, formation, options = {}) {
  return {
    app: {
      id: `${name}-id`,
      name,
      space: options.shielded ? {shield: true} : null,
    },
    addons: options.addons ?? [],
    dynos,
    formation,
  }
}

test('builds a sorted report and aggregates Cedar resources', () => {
  const report = buildTestReport('example', 'production', [
    appResources(
      'zulu',
      [
        {size: 'Standard-2X', state: 'up', type: 'web'},
        {size: 'Standard-2X', state: 'crashed', type: 'web'},
      ],
      [{quantity: 2, size: 'Standard-2X', type: 'web'}],
    ),
    appResources(
      'alpha',
      [{size: 'Basic', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Basic', type: 'web'}],
    ),
  ])

  assert.deepEqual(report.rows.map((row) => row.app), ['alpha', 'zulu'])
  assert.deepEqual(report.rows[1], {
    app: 'zulu',
    cpu: '4x shared',
    dynoSize: 'Standard-2X',
    dynos: 2,
    ecoPlan: false,
    monthlyCost: 100,
    process: 'web',
    ramPerDynoMb: 1024,
    up: 1,
  })
  assert.deepEqual(report.summary, {
    allocatedRamMb: 2560,
    appCount: 2,
    dynoCount: 3,
    estimatedMonthlyCost: 107,
    includesEcoPlan: false,
    unknownCost: false,
    unknownRam: false,
    upCount: 2,
  })
})

test('supports Fir vCPUs, Shield pricing, Eco plans, and unknown one-off costs', () => {
  const report = buildTestReport('example', 'production', [
    appResources(
      'fir-app',
      [
        {size: 'dyno-2c-8gb', state: 'up', type: 'web'},
        {size: 'dyno-2c-8gb', state: 'up', type: 'web'},
      ],
      [{quantity: 2, size: 'dyno-2c-8gb', type: 'web'}],
    ),
    appResources(
      'shield-app',
      [{size: 'Private-S', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Private-S', type: 'web'}],
      {shielded: true},
    ),
    appResources(
      'eco-app',
      [
        {size: 'Eco', state: 'up', type: 'web'},
        {size: 'Basic', state: 'up', type: 'run'},
      ],
      [{quantity: 1, size: 'Eco', type: 'web'}],
    ),
  ])

  assert.equal(report.rows.find((row) => row.app === 'fir-app').cpu, '4 vCPU')
  assert.equal(report.rows.find((row) => row.app === 'fir-app').monthlyCost, 320)
  assert.equal(report.rows.find((row) => row.app === 'shield-app').monthlyCost, 270)
  assert.equal(report.rows.find((row) => row.app === 'eco-app' && row.process === 'web').ecoPlan, true)
  assert.equal(report.rows.find((row) => row.process === 'run').monthlyCost, null)
  assert.equal(report.summary.includesEcoPlan, true)
  assert.equal(report.summary.unknownCost, true)
  assert.match(formatReport(report), /\$5\/mo shared/)
  assert.match(formatReport(report), /shared \$5 Eco plan \+ unknown\/month estimated/)
})

test('includes apps without dynos and formats the terminal report', () => {
  const report = buildTestReport('example', 'staging', [appResources('empty-app', [], [])])
  const output = formatReport(report)

  assert.match(output, /^Pipeline: example \(staging\)/)
  assert.match(output, /RAM\/dyno\s+CPU\s+Cost/)
  assert.match(output, /empty-app\s+\(none\)/)
  assert.match(output, /\$0\/mo/)
  assert.match(output, /Total: 1 app, 0 dynos, 0 up, 0 MB allocated RAM, \$0\/month estimated/)
  assert.match(output, /Add-ons\n\nNo add-ons\./)
})

test('reports add-on services and their billed costs separately', () => {
  const report = buildTestReport('example', 'production', [
    appResources('zulu', [], [], {
      addons: [
        {
          addon_service: {human_name: 'Metered Service', name: 'metered'},
          billed_price: {cents: 1250, contract: false, metered: true, unit: 'month'},
          name: 'metered-example',
          plan: {human_name: 'Usage', name: 'metered:usage'},
          state: 'provisioned',
        },
        {
          addon_service: {human_name: 'Contract Service', name: 'contract'},
          billed_price: {cents: 10_000, contract: true, metered: false, unit: 'month'},
          name: 'contract-example',
          plan: {human_name: 'Enterprise', name: 'contract:enterprise'},
          state: 'provisioning',
        },
        {
          addon_service: {human_name: 'Unknown Service', name: 'unknown'},
          billed_price: null,
          name: 'unknown-example',
          plan: {
            human_name: 'Published Price',
            name: 'unknown:published',
            price: {cents: 9900, contract: false, metered: false, unit: 'month'},
          },
          state: 'provisioned',
        },
      ],
    }),
    appResources('alpha', [], [], {
      addons: [
        {
          addon_service: {human_name: 'AppSignal APM', name: 'appsignal'},
          billed_price: {cents: 5500, contract: false, metered: false, unit: 'month'},
          name: 'appsignal-example',
          plan: {
            human_name: '3M',
            name: 'appsignal:small',
            price: {cents: 5500, contract: false, metered: false, unit: 'month'},
          },
          state: 'provisioned',
        },
      ],
    }),
  ])

  assert.deepEqual(report.addons.map((addon) => addon.app), ['alpha', 'zulu', 'zulu', 'zulu'])
  assert.deepEqual(report.addons[0], {
    app: 'alpha',
    contract: false,
    costCents: 5500,
    costUnit: 'month',
    metered: false,
    name: 'appsignal-example',
    plan: '3M',
    service: 'AppSignal APM',
    state: 'provisioned',
  })
  assert.deepEqual(report.addonSummary, {
    addonCount: 4,
    estimatedMonthlyCostCents: 5500,
    unknownCost: true,
  })
  assert.equal(report.addons.find((addon) => addon.service === 'Unknown Service').costCents, null)

  const output = formatReport(report)
  assert.match(output, /App\s+Service\s+Plan\s+State\s+Cost/)
  assert.match(output, /AppSignal APM\s+3M\s+provisioned\s+\$55\/mo/)
  assert.match(output, /Metered Service\s+Usage\s+provisioned\s+metered/)
  assert.match(output, /Contract Service\s+Enterprise\s+provisioning\s+contract/)
  assert.match(output, /Unknown Service\s+Published Price\s+provisioned\s+n\/a/)
  assert.match(output, /Total: 4 add-ons, \$55\/month estimated \+ unknown costs/)
})

test('formats an empty stage without a table', () => {
  const report = buildTestReport('example', 'development', [])

  assert.equal(formatReport(report), 'Pipeline: example (development)\n\nNo apps found in the development stage.')
})

test('uses singular summary labels', () => {
  const report = buildTestReport('example', 'production', [
    appResources(
      'only-app',
      [{size: 'Basic', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Basic', type: 'web'}],
      {
        addons: [{
          addon_service: {human_name: 'Example Service'},
          billed_price: {cents: 0, contract: false, metered: false, unit: 'month'},
          name: 'example-addon',
          plan: {human_name: 'Free'},
          state: 'provisioned',
        }],
      },
    ),
  ])
  const output = formatReport(report)

  assert.match(output, /Total: 1 app, 1 dyno, 1 up/)
  assert.match(output, /Total: 1 add-on, \$0\/month estimated/)
})

test('uses live dyno size metadata for resources and public pricing', () => {
  const dynoSizes = [{
    compute: 7,
    cost: {cents: 1234, unit: 'monthly'},
    dedicated: true,
    generation: {name: 'cedar'},
    memory: 3.5,
    name: 'Custom-Dyno',
  }]
  const report = buildReport('example', 'production', [
    appResources(
      'custom-app',
      [{size: 'Custom-Dyno', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Custom-Dyno', type: 'web'}],
    ),
  ], dynoSizes)

  assert.equal(report.rows[0].ramPerDynoMb, 3584)
  assert.equal(report.rows[0].cpu, '1 dedicated (7x)')
  assert.equal(report.rows[0].monthlyCost, 12.34)
  assert.match(formatReport(report), /\$12\.34\/mo/)
})
