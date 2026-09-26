import {displayAddonPlan, normalizeAddonPlan} from './addon-plans.js'

// Published RAM allocations, verified 2026-09-25:
// https://elements.heroku.com/addons/heroku-postgresql
// Standard, Premium, Private, and Shield share these sizes; L/XL only increase disk capacity.
const POSTGRES_RAM_BY_SIZE = {
  0: '4 GB',
  2: '8 GB',
  3: '15 GB',
  4: '30.5 GB',
  5: '61 GB',
  6: '122 GB',
  7: '244 GB',
  8: '488 GB',
  9: '768 GB',
  10: '1 TB',
}

function postgresRamForPlan(plan) {
  const name = normalizeAddonPlan(plan)
  if (!name) return null
  if (/^essential-[012]$/.test(name)) return 'shared'

  const match = name.match(/^(standard|premium|private|shield)(?:-(l|xl))?-(\d+)$/)
  if (!match) return null
  const [, tier, variant, size] = match
  if (variant && (tier === 'standard' || !['6', '9'].includes(size))) return null
  return POSTGRES_RAM_BY_SIZE[size] ?? null
}

function infoValue(info, name) {
  const values = info.find((entry) => entry?.name === name)?.values
  const value = Array.isArray(values) ? values[0] : null
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function providerStatus(info) {
  const values = info.find((entry) => entry?.name === 'Status')?.values
  if (!Array.isArray(values)) return null
  return values.filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()).join(', ') || null
}

function connectionLimit(value) {
  if (!/^\d+(?:,\d{3})*$/.test(value)) return null
  const limit = Number(value.replaceAll(',', ''))
  return Number.isSafeInteger(limit) ? limit : null
}

function storageLimit(value) {
  // Essential Postgres appends both utilization and compliance annotations.
  const match = value.match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(B|[KMGTPE]i?B)(?:\s+\([^)]*\))*$/i)
  return match ? `${match[1]} ${match[2]}` : null
}

export async function fetchAddonDetails(heroku, addon) {
  const limits = {diskSize: null, maxConnections: null, ram: null}
  const details = {activePlan: null, limits, providerStatus: null}
  const service = addon.addon_service?.name
  let url
  if (service === 'heroku-postgresql' && addon.id) {
    url = `https://postgres-api.heroku.com/client/v11/databases/${encodeURIComponent(addon.id)}`
  } else if (service === 'heroku-redis' && addon.name) {
    url = `https://api.data.heroku.com/redis/v0/databases/${encodeURIComponent(addon.name)}`
  } else {
    return details
  }

  let body
  try {
    // Service details are optional: an inaccessible add-on must not prevent the report.
    const response = await heroku.get(url, {retryAuth: false, timeout: 10_000})
    body = response.body
  } catch {
    return details
  }

  const info = Array.isArray(body?.info) ? body.info : []
  // The Platform API's billed plan may already reflect a change that isn't active yet.
  const bodyPlan = typeof body?.plan === 'string' ? body.plan : body?.plan?.name
  const activePlan = normalizeAddonPlan(bodyPlan) ?? normalizeAddonPlan(infoValue(info, 'Plan'))
  details.activePlan = displayAddonPlan(activePlan)
  details.providerStatus = providerStatus(info)
  if (service === 'heroku-postgresql') {
    // Use the capacity after the slash, never the current connection count or data size.
    limits.maxConnections = connectionLimit(infoValue(info, 'Connections').split('/')[1]?.trim() ?? '')
    limits.diskSize = storageLimit(infoValue(info, 'Data Size').split('/')[1]?.trim() ?? '')
    limits.ram = postgresRamForPlan(activePlan)
  } else {
    limits.maxConnections = connectionLimit(infoValue(info, 'Plan Connection Limit'))
    limits.ram = storageLimit(infoValue(info, 'Maxmemory'))
  }

  return details
}
