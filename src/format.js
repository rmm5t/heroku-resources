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
  if (addon.costCents === null) return 'n/a'

  const unit = addon.costUnit === 'month' ? 'mo' : addon.costUnit
  const cost = `${formatCurrency(addon.costCents)}${unit ? `/${unit}` : ''}`
  return addon.metered ? `${cost} + usage` : cost
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

export function formatReport(report) {
  const output = [`Pipeline: ${report.pipeline} (${report.stage})`, '']
  if (report.rows.length === 0) {
    output.push(`No apps found in the ${report.stage} stage.`)
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
    `Total: ${report.summary.appCount} apps, ${report.summary.dynoCount} dynos, `
    + `${report.summary.upCount} up, ${memoryTotal} allocated RAM, ${formatCostTotal(report)}/month estimated`,
  )
  output.push('Allocation is based on dyno size; live CPU and RAM utilization is not available from the Heroku Platform API.')
  output.push('', 'Add-ons', '')

  if (report.addons.length === 0) {
    output.push('No add-ons.')
    return output.join('\n')
  }

  const addonRows = report.addons.map((addon) => [
    addon.app,
    addon.service,
    addon.plan,
    addon.state,
    formatAddonCost(addon),
  ])
  output.push(renderTable(
    ['App', 'Service', 'Plan', 'State', 'Cost'],
    addonRows,
    [4],
  ))

  const addonCost = `${formatCurrency(report.addonSummary.estimatedMonthlyCostCents)}/month estimated`
  const unknownAddonCost = report.addonSummary.unknownCost ? ' + unknown costs' : ''
  output.push('', `Total: ${report.addonSummary.addonCount} add-ons, ${addonCost}${unknownAddonCost}`)
  return output.join('\n')
}
