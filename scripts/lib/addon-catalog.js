import {normalizeAddonPlan} from '../../src/addon-plans.js'

function attribute(attributes, name) {
  return attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'))?.[2]
}

function hasClass(attributes, name) {
  return (attribute(attributes, 'class') ?? '').split(/\s+/).includes(name)
}

function planData(html, edition) {
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => hasClass(attributes, 'postgres-plans-data') && attribute(attributes, 'data-dialog') === edition)
  if (blocks.length !== 1 || attribute(blocks[0][1], 'type') !== 'application/json') {
    throw new Error(`Expected one ${edition} Postgres plan catalog JSON block`)
  }

  let plans
  try {
    plans = JSON.parse(blocks[0][2])
  } catch (cause) {
    throw new Error(`Unable to parse ${edition} Postgres plan catalog JSON`, {cause})
  }
  if (!Array.isArray(plans) || plans.length === 0) {
    throw new Error(`The ${edition} Postgres plan catalog must be a non-empty array`)
  }
  return plans
}

function planName(value, edition) {
  const name = normalizeAddonPlan(value)
  const pattern = edition === 'essential' ? /^essential-/ : /^(standard|premium|private|shield)-/
  if (!name || !pattern.test(name)) throw new Error(`Invalid ${edition} Postgres plan name: ${String(value)}`)
  return name
}

function ramValue(value, name) {
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'shared') return 'shared'
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i)
    if (match && Number.isFinite(Number(match[1])) && Number(match[1]) > 0) {
      return `${Number(match[1])} ${match[2].toUpperCase()}`
    }
  }
  throw new Error(`Missing or invalid RAM in the Postgres catalog for ${name}: ${String(value)}`)
}

function textWithClass(html, tag, className) {
  const matches = [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
    .filter(([, attributes]) => hasClass(attributes, className))
  if (matches.length !== 1) throw new Error(`Expected one ${className} field in an Essential Postgres row`)
  return matches[0][2].replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').trim()
}

function essentialRam(html) {
  const panel = html.match(/<div\b[^>]*\bid\s*=\s*['"]postgres-essential-panel['"][^>]*>([\s\S]*?)<\/section>/i)?.[1]
  if (!panel) throw new Error('Unable to find the Essential Postgres pricing panel')

  const rows = [...panel.matchAll(/<div\b([^>]*)>/gi)]
    .filter(([, attributes]) => hasClass(attributes, 'postgres-row'))
  if (rows.length === 0) throw new Error('No Essential Postgres pricing rows found')

  const plans = new Map()
  for (const [index, row] of rows.entries()) {
    const content = panel.slice(row.index + row[0].length, rows[index + 1]?.index ?? panel.length)
    const name = planName(textWithClass(content, 'span', 'plan-name'), 'essential')
    if (plans.has(name)) throw new Error(`Duplicate Essential Postgres pricing row: ${name}`)
    plans.set(name, ramValue(textWithClass(content, 'div', 'col-memory'), name))
  }
  return plans
}

export function parsePostgresCatalog(html) {
  const plans = new Map()
  for (const plan of planData(html, 'classic')) {
    const name = planName(plan?.name, 'classic')
    if (plans.has(name)) throw new Error(`Duplicate Postgres catalog plan: ${name}`)
    plans.set(name, ramValue(plan?.memory_in_gb, name))
  }

  // Essential JSON uses a "0 Bytes" placeholder. Verify the actual displayed RAM instead.
  const essentialPlans = essentialRam(html)
  const seen = new Set()
  for (const plan of planData(html, 'essential')) {
    const name = planName(plan?.name, 'essential')
    if (seen.has(name)) throw new Error(`Duplicate Postgres catalog plan: ${name}`)
    if (!essentialPlans.has(name)) throw new Error(`Missing Essential Postgres pricing row: ${name}`)
    seen.add(name)
    plans.set(name, essentialPlans.get(name))
  }
  if (seen.size !== essentialPlans.size) throw new Error('Essential Postgres pricing rows do not match the catalog JSON')
  return plans
}

export function comparePostgresRam(local, upstream) {
  const differences = []
  const names = new Set([...local.keys(), ...upstream.keys()])
  for (const name of [...names].sort()) {
    if (!local.has(name)) differences.push(`${name}: missing locally (upstream ${upstream.get(name)})`)
    else if (!upstream.has(name)) differences.push(`${name}: missing upstream (local ${local.get(name)})`)
    else if (ramValue(local.get(name), name) !== upstream.get(name)) {
      differences.push(`${name}: local ${local.get(name)}, upstream ${upstream.get(name)}`)
    }
  }
  return differences
}
