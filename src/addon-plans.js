export function normalizeAddonPlan(plan) {
  if (typeof plan !== 'string') return null
  return plan.toLowerCase().replace(/^[^:]+:/, '').trim().replace(/\s+/g, '-') || null
}

export function displayAddonPlan(plan) {
  const name = normalizeAddonPlan(plan)
  if (!name) return null
  return name.split('-')
    .map((word) => ['l', 'xl'].includes(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
