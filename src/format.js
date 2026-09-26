import {normalizeAddonPlan} from './addon-plans.js'

function formatMemory(megabytes) {
  if (megabytes === null) return 'n/a'
  if (megabytes < 1024) return `${megabytes} MB`

  const gigabytes = megabytes / 1024
  return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} GB`
}

function formatCost(row) {
  if (row.ecoPlan) return '$5/mo shared'
  if (row.monthlyCost === null) return 'n/a'
  return `$${row.monthlyCost}/mo`
}

function formatCurrency(cents) {
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`
}

function formatAddonCost(addon) {
  if (addon.contract) return 'contract'
  if (addon.metered) return 'metered'
  if (addon.costCents === null) return 'n/a'

  const unit = addon.costUnit === 'month' ? 'mo' : addon.costUnit
  return `${formatCurrency(addon.costCents)}${unit ? `/${unit}` : ''}`
}

function formatAddonPlan(addon) {
  if (addon.planChangePending && addon.activePlan && addon.plan !== '?'
    && normalizeAddonPlan(addon.activePlan) !== normalizeAddonPlan(addon.plan)) {
    return `${addon.activePlan} → ${addon.plan}`
  }
  return addon.plan
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

function renderTable(headers, rows, rightAlignedColumns) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  )
  const rightAligned = new Set(rightAlignedColumns)
  const render = (row) => row
    .map((value, index) => rightAligned.has(index) ? value.padStart(widths[index]) : value.padEnd(widths[index]))
    .join('  ')
    .trimEnd()

  return [
    render(headers),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map(render),
  ].join('\n')
}

function formatCostTotal(report) {
  const parts = []
  if (report.summary.estimatedMonthlyCost > 0 || !report.summary.includesEcoPlan) {
    parts.push(`$${report.summary.estimatedMonthlyCost}`)
  }

  if (report.summary.includesEcoPlan) parts.push('shared $5 Eco plan')
  if (report.summary.unknownCost) parts.push('unknown')
  return parts.join(' + ')
}

function formatGrandTotal({estimatedMonthlyCostCents, includesEcoPlan, unknownCost}) {
  const parts = []
  if (estimatedMonthlyCostCents > 0 || !includesEcoPlan) {
    parts.push(`${formatCurrency(estimatedMonthlyCostCents)}/month estimated`)
  }
  if (includesEcoPlan) parts.push('shared $5 Eco plan')
  if (unknownCost) parts.push('unknown costs')
  return `Grand total: ${parts.join(' + ')}`
}

export function formatReport(report) {
  const output = [`Pipeline: ${report.pipeline} (${report.stage})`, '']
  const grandTotal = formatGrandTotal(report.grandTotal)
  if (report.rows.length === 0) {
    output.push(`No apps found in the ${report.stage} stage.`, '', grandTotal)
    return output.join('\n')
  }

  const rows = report.rows.map((row) => [
    row.app,
    row.process,
    row.dynoSize,
    row.dynos.toString(),
    row.up.toString(),
    formatMemory(row.ramPerDynoMb),
    row.cpu,
    formatCost(row),
  ])
  output.push(renderTable(
    ['App', 'Process', 'Dyno size', 'Dynos', 'Up', 'RAM/dyno', 'CPU', 'Cost'],
    rows,
    [3, 4, 5, 6, 7],
  ))

  const memoryTotal = `${formatMemory(report.summary.allocatedRamMb)}${report.summary.unknownRam ? ' + unknown' : ''}`
  output.push('')
  output.push(
    `Total: ${report.summary.appCount} ${pluralize(report.summary.appCount, 'app')}, `
    + `${report.summary.dynoCount} ${pluralize(report.summary.dynoCount, 'dyno')}, `
    + `${report.summary.upCount} up, ${memoryTotal} allocated RAM, ${formatCostTotal(report)}/month estimated`,
  )
  output.push('Allocation is based on dyno size; live CPU and RAM utilization is not available from the Heroku Platform API.')
  output.push('', 'Add-ons', '')

  if (report.addons.length === 0) {
    output.push('No add-ons.', '', grandTotal)
    return output.join('\n')
  }

  const addonRows = report.addons.map((addon) => [
    addon.app,
    addon.service,
    formatAddonPlan(addon),
    addon.state,
    addon.maxConnections?.toString() ?? 'n/a',
    addon.ram ?? 'n/a',
    addon.diskSize ?? 'n/a',
    formatAddonCost(addon),
  ])
  output.push(renderTable(
    ['App', 'Service', 'Plan', 'State', 'Conn limit', 'RAM', 'Disk Size', 'Cost'],
    addonRows,
    [4, 5, 6, 7],
  ))

  const addonCost = `${formatCurrency(report.addonSummary.estimatedMonthlyCostCents)}/month estimated`
  const unknownAddonCost = report.addonSummary.unknownCost ? ' + unknown costs' : ''
  const addonLabel = pluralize(report.addonSummary.addonCount, 'add-on')
  output.push('', `Total: ${report.addonSummary.addonCount} ${addonLabel}, ${addonCost}${unknownAddonCost}`)
  output.push('', grandTotal)
  return output.join('\n')
}
