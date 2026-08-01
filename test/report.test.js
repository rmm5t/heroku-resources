import assert from 'node:assert/strict'
import test from 'node:test'

import {formatReport} from '../src/format.js'
import {buildReport} from '../src/report.js'

function appResources(name, dynos, formation, options = {}) {
  return {
    app: {
      id: `${name}-id`,
      name,
      space: options.shielded ? {shield: true} : null,
    },
    dynos,
    formation,
  }
}

test('builds a sorted report and aggregates Cedar resources', () => {
  const report = buildReport('example', 'production', [
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
  const report = buildReport('example', 'production', [
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
  assert.match(formatReport(report), /shared \$5 Eco plan \+ unknown\/month estimated/)
})

test('includes apps without dynos and formats the terminal report', () => {
  const report = buildReport('example', 'staging', [appResources('empty-app', [], [])])
  const output = formatReport(report)

  assert.match(output, /^Pipeline: example \(staging\)/)
  assert.match(output, /RAM\/dyno\s+CPU\s+Cost/)
  assert.match(output, /empty-app\s+\(none\)/)
  assert.match(output, /Total: 1 apps, 0 dynos, 0 up, 0 MB allocated RAM, \$0\/month estimated/)
})

test('formats an empty stage without a table', () => {
  const report = buildReport('example', 'development', [])

  assert.equal(formatReport(report), 'Pipeline: example (development)\n\nNo apps found in the development stage.')
})
