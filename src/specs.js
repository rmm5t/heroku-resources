export const DYNO_COSTS_SOURCE = 'https://raw.githubusercontent.com/heroku/cli/main/src/commands/ps/type.ts'

// Used only when the Platform API doesn't provide a price, currently Private, Shield, and Fir sizes.
export const COST_MONTHLY = {
  '1X': 36,
  '2X': 72,
  Basic: 7,
  'dyno-1c-0.5gb': 25,
  'dyno-1c-4gb': 80,
  'dyno-1c-8gb': 100,
  'dyno-2c-1gb': 50,
  'dyno-2c-4gb': 150,
  'dyno-2c-8gb': 160,
  'dyno-2c-16gb': 250,
  'dyno-4c-8gb': 300,
  'dyno-4c-16gb': 320,
  'dyno-4c-32gb': 500,
  'dyno-8c-16gb': 600,
  'dyno-8c-32gb': 640,
  'dyno-8c-64gb': 750,
  'dyno-16c-32gb': 1200,
  'dyno-16c-64gb': 1000,
  'dyno-16c-128gb': 1500,
  'dyno-32c-64gb': 2400,
  Eco: 0,
  Free: 0,
  Hobby: 7,
  Performance: 500,
  'Performance-2XL': 1500,
  'Performance-L': 500,
  'Performance-L-RAM': 500,
  'Performance-M': 250,
  'Performance-XL': 750,
  'Private-2XL': 1500,
  'Private-L': 900,
  'Private-L-RAM': 500,
  'Private-M': 450,
  'Private-S': 225,
  'Private-XL': 750,
  PX: 576,
  'Shield-2XL': 1800,
  'Shield-L': 1080,
  'Shield-L-RAM': 600,
  'Shield-M': 540,
  'Shield-S': 270,
  'Shield-XL': 900,
  'Standard-1X': 25,
  'Standard-2X': 50,
}

function billingSize(size, shielded) {
  return shielded ? size.replace('Private-', 'Shield-') : size
}

function findDynoSize(size, shielded, dynoSizes) {
  const name = billingSize(size, shielded).toLowerCase()
  return dynoSizes.find((dynoSize) => dynoSize.name.toLowerCase() === name)
}

export function memoryForSize(size, shielded, dynoSizes) {
  const dynoSize = findDynoSize(size, shielded, dynoSizes)
  return Number.isFinite(dynoSize?.memory) ? dynoSize.memory * 1024 : null
}

export function cpuForSize(size, quantity, shielded, dynoSizes) {
  const dynoSize = findDynoSize(size, shielded, dynoSizes)
  if (!Number.isFinite(dynoSize?.compute)) return 'n/a'

  const compute = dynoSize.compute * quantity
  if (dynoSize.generation?.name === 'fir') return `${compute} vCPU`
  if (!dynoSize.dedicated) return `${compute}x shared`

  return `${quantity} dedicated (${compute}x)`
}

export function monthlyCostForSize(
  size,
  quantity,
  shielded,
  dynoSizes,
) {
  const name = billingSize(size, shielded)
  const dynoSize = findDynoSize(size, shielded, dynoSizes)
  const apiCost = dynoSize?.cost
  const apiMonthlyCost = ['month', 'monthly'].includes(apiCost?.unit) && Number.isFinite(apiCost?.cents)
    ? apiCost.cents / 100
    : null
  const monthlyCost = apiMonthlyCost ?? COST_MONTHLY[name]
  if (!Number.isFinite(monthlyCost)) return {ecoPlan: false, monthlyCost: null}

  return {
    ecoPlan: name === 'Eco',
    monthlyCost: monthlyCost * quantity,
  }
}
