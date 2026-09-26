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
  assert.deepEqual(report.grandTotal, {
    estimatedMonthlyCostCents: 10700,
    includesEcoPlan: false,
    unknownCost: false,
  })
  assert.match(formatReport(report), /No add-ons\.\n\nGrand total: \$107\/month estimated$/)
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
  assert.deepEqual(report.grandTotal, {
    estimatedMonthlyCostCents: 59000,
    includesEcoPlan: true,
    unknownCost: true,
  })
  assert.match(formatReport(report), /Grand total: \$590\/month estimated \+ shared \$5 Eco plan \+ unknown costs$/)
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
  assert.match(output, /Grand total: \$0\/month estimated$/)
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
    activePlan: null,
    app: 'alpha',
    contract: false,
    costCents: 5500,
    costUnit: 'month',
    diskSize: null,
    maxConnections: null,
    metered: false,
    name: 'appsignal-example',
    plan: '3M',
    planChangePending: false,
    providerStatus: null,
    ram: null,
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
  assert.match(output, /App\s+Service\s+Plan\s+State\s+Conn limit\s+RAM\s+Disk Size\s+Cost/)
  assert.match(output, /AppSignal APM\s+3M\s+provisioned\s+n\/a\s+n\/a\s+n\/a\s+\$55\/mo/)
  assert.match(output, /Metered Service\s+Usage\s+provisioned\s+n\/a\s+n\/a\s+n\/a\s+metered/)
  assert.match(output, /Contract Service\s+Enterprise\s+provisioning\s+n\/a\s+n\/a\s+n\/a\s+contract/)
  assert.match(output, /Unknown Service\s+Published Price\s+provisioned\s+n\/a\s+n\/a\s+n\/a\s+n\/a/)
  assert.match(output, /Total: 4 add-ons, \$55\/month estimated \+ unknown costs/)
  assert.deepEqual(report.grandTotal, {
    estimatedMonthlyCostCents: 5500,
    includesEcoPlan: false,
    unknownCost: true,
  })
  assert.match(output, /Grand total: \$55\/month estimated \+ unknown costs$/)
})

test('combines dyno dollars and add-on cents in the grand total', () => {
  const report = buildTestReport('example', 'production', [
    appResources(
      'example-production',
      [{size: 'Basic', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Basic', type: 'web'}],
      {addons: [{name: 'example-addon', billed_price: {cents: 1599, unit: 'month'}}]},
    ),
  ])

  assert.deepEqual(JSON.parse(JSON.stringify(report)).grandTotal, {
    estimatedMonthlyCostCents: 2299,
    includesEcoPlan: false,
    unknownCost: false,
  })
  assert.match(formatReport(report), /Total: 1 add-on, \$15\.99\/month estimated\n\nGrand total: \$22\.99\/month estimated$/)
})

test('includes shared Eco pricing once in the grand total across multiple apps', () => {
  for (const addons of [[], [{name: 'example-addon', billed_price: {cents: 1500, unit: 'month'}}]]) {
    const report = buildTestReport('example', 'production', ['alpha', 'beta'].map((name) => appResources(
      name,
      [{size: 'Eco', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Eco', type: 'web'}],
      {addons: name === 'alpha' ? addons : []},
    )))

    assert.deepEqual(report.grandTotal, {
      estimatedMonthlyCostCents: addons.length ? 1500 : 0,
      includesEcoPlan: true,
      unknownCost: false,
    })
    const total = addons.length ? '$15/month estimated + shared $5 Eco plan' : 'shared $5 Eco plan'
    assert.ok(formatReport(report).endsWith(`Grand total: ${total}`))
  }
})

test('excludes non-monthly add-on prices from the grand total and marks them unknown', () => {
  const report = buildTestReport('example', 'production', [
    appResources(
      'example-production',
      [{size: 'Basic', state: 'up', type: 'web'}],
      [{quantity: 1, size: 'Basic', type: 'web'}],
      {addons: [{name: 'example-addon', billed_price: {cents: 500, unit: 'hour'}}]},
    ),
  ])

  assert.deepEqual(report.grandTotal, {
    estimatedMonthlyCostCents: 700,
    includesEcoPlan: false,
    unknownCost: true,
  })
  assert.match(formatReport(report), /Grand total: \$7\/month estimated \+ unknown costs$/)
})

test('includes add-on capacities in the structured report and aligns the new columns', () => {
  const report = buildTestReport('example', 'production', [
    appResources('example-production', [], [], {
      addons: [
        {
          addon_service: {human_name: 'Heroku Postgres'},
          billed_price: {cents: 5000, unit: 'month'},
          limits: {diskSize: '64 GB', maxConnections: 200, ram: '4 GB'},
          name: 'postgresql-example',
          plan: {human_name: 'Standard 0'},
          state: 'provisioned',
        },
        {
          addon_service: {human_name: 'Heroku Key-Value Store'},
          billed_price: {cents: 6000, unit: 'month'},
          limits: {diskSize: null, maxConnections: 200, ram: '250 MB'},
          name: 'redis-example',
          plan: {human_name: 'Premium 2'},
          state: 'provisioned',
        },
      ],
    }),
  ])

  assert.deepEqual(report.addons.map(({diskSize, maxConnections, ram}) => ({diskSize, maxConnections, ram})), [
    {diskSize: null, maxConnections: 200, ram: '250 MB'},
    {diskSize: '64 GB', maxConnections: 200, ram: '4 GB'},
  ])
  const output = formatReport(report)
  assert.match(output, /Heroku Key-Value Store\s+Premium 2\s+provisioned\s+200\s+250 MB\s+n\/a\s+\$60\/mo/)
  assert.match(output, /Heroku Postgres\s+Standard 0\s+provisioned\s+200\s+4 GB\s+64 GB\s+\$50\/mo/)
  const lines = output.split('\n')
  const header = lines.find((line) => line.includes('Conn limit'))
  const postgres = lines.find((line) => line.includes('Heroku Postgres'))
  const redis = lines.find((line) => line.includes('Heroku Key-Value Store'))
  for (const [line, column, value] of [
    [postgres, 'RAM', '4 GB'],
    [postgres, 'Disk Size', '64 GB'],
    [redis, 'RAM', '250 MB'],
  ]) {
    assert.equal(line.indexOf(value) + value.length, header.indexOf(column) + column.length)
  }
})

test('shows a pending upgrade with its active-to-target plan transition and active resources', () => {
  const providerStatus = 'Upgrading Plan: Replacing Primary, Maintenance Scheduled'
  const report = buildTestReport('example', 'production', [
    appResources('example-production', [], [], {
      addons: [{
        activePlan: 'Standard 0',
        addon_service: {human_name: 'Heroku Postgres', name: 'heroku-postgresql'},
        billed_price: {cents: 20000, unit: 'month'},
        limits: {diskSize: '64 GB', maxConnections: 200, ram: '4 GB'},
        name: 'postgresql-example',
        plan: {human_name: 'Standard 2', name: 'heroku-postgresql:standard-2'},
        providerStatus,
        state: 'provisioned',
      }],
    }),
  ])
  const [addon] = JSON.parse(JSON.stringify(report)).addons

  assert.equal(addon.activePlan, 'Standard 0')
  assert.equal(addon.plan, 'Standard 2')
  assert.equal(addon.providerStatus, providerStatus)
  assert.equal(addon.planChangePending, true)
  assert.equal(addon.state, 'upgrade pending')
  assert.equal(report.addonSummary.estimatedMonthlyCostCents, 20000)
  assert.match(formatReport(report), /Standard 0 → Standard 2\s+upgrade pending\s+200\s+4 GB\s+64 GB\s+\$200\/mo/)
})

test('labels plan mismatches as pending changes without inferring upgrade direction', () => {
  for (const [service, activePlan, targetPlan] of [
    ['heroku-postgresql', 'Standard 0', 'Standard 2'],
    ['heroku-postgresql', 'Standard 2', 'Standard 0'],
    ['heroku-redis', 'Premium 2', 'Premium 0'],
  ]) {
    const report = buildTestReport('example', 'production', [
      appResources('example-production', [], [], {
        addons: [{
          activePlan,
          addon_service: {name: service},
          name: 'example-addon',
          plan: {human_name: targetPlan},
          providerStatus: 'available',
          state: 'provisioned',
        }],
      }),
    ])
    assert.equal(report.addons[0].state, 'plan change pending')
    assert.equal(report.addons[0].planChangePending, true)
    assert.ok(formatReport(report).includes(`${activePlan} → ${targetPlan}`))
  }
})

test('does not flag completed changes, ordinary maintenance, or missing service metadata', () => {
  for (const [activePlan, providerStatus, plan, state] of [
    ['Standard 2', 'Available', {name: 'heroku-postgresql:standard-2'}, 'provisioned'],
    ['Standard 2', 'Maintenance Scheduled', {human_name: 'Standard 2'}, 'provisioned'],
    ['Standard 2', 'Upgrading PostgreSQL Version', {human_name: 'Standard 2'}, 'provisioned'],
    ['Premium XL 6', 'Available', {name: 'heroku-postgresql:premium-xl-6'}, 'provisioned'],
    ['Standard 2', 'Available', {human_name: ' STANDARD-2 '}, 'provisioned'],
    ['Standard 2', 'Available', {}, 'provisioned'],
    [null, null, {human_name: 'Standard 2'}, 'provisioned'],
    [null, null, {human_name: 'Standard 2'}, 'provisioning'],
  ]) {
    const report = buildTestReport('example', 'production', [
      appResources('example-production', [], [], {
        addons: [{activePlan, name: 'example-addon', plan, providerStatus, state}],
      }),
    ])
    assert.equal(report.addons[0].planChangePending, false)
    assert.equal(report.addons[0].state, state)
    assert.equal(report.addons[0].providerStatus, providerStatus)
    assert.doesNotMatch(formatReport(report), /→|upgrade pending|plan change pending/)
  }
})

test('shows explicit upgrades without inventing unknown or identical plan transitions', () => {
  for (const [activePlan, plan] of [
    [null, {human_name: 'Standard 2'}],
    ['Standard 0', {}],
    ['Standard 2', {name: 'heroku-postgresql:standard-2'}],
  ]) {
    const report = buildTestReport('example', 'production', [
      appResources('example-production', [], [], {
        addons: [{
          activePlan,
          name: 'example-addon',
          plan,
          providerStatus: 'Upgrading Plan: Replacing Primary',
          state: 'provisioned',
        }],
      }),
    ])
    assert.equal(report.addons[0].planChangePending, true)
    assert.equal(report.addons[0].state, 'upgrade pending')
    assert.match(formatReport(report), /upgrade pending/)
    assert.doesNotMatch(formatReport(report), /→/)
  }
})

test('formats an empty stage without a table', () => {
  const report = buildTestReport('example', 'development', [])

  assert.equal(formatReport(report), 'Pipeline: example (development)\n\nNo apps found in the development stage.\n\nGrand total: $0/month estimated')
  assert.deepEqual(report.grandTotal, {
    estimatedMonthlyCostCents: 0,
    includesEcoPlan: false,
    unknownCost: false,
  })
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
  assert.equal(report.grandTotal.estimatedMonthlyCostCents, 1234)
  assert.match(formatReport(report), /Grand total: \$12\.34\/month estimated$/)
})
