const DYNO_MEMORY_MB = {
  basic: 512,
  eco: 512,
  'performance-2xl': 129_024,
  'performance-l': 14_336,
  'performance-l-ram': 30_720,
  'performance-m': 2_560,
  'performance-xl': 63_488,
  'private-2xl': 129_024,
  'private-l': 14_336,
  'private-l-ram': 30_720,
  'private-m': 2_560,
  'private-s': 1_024,
  'private-xl': 63_488,
  'shield-2xl': 129_024,
  'shield-l': 14_336,
  'shield-l-ram': 30_720,
  'shield-m': 2_560,
  'shield-s': 1_024,
  'shield-xl': 63_488,
  'standard-1x': 512,
  'standard-2x': 1_024,
}

const DYNO_CPU = {
  basic: ['shared', 1],
  eco: ['shared', 1],
  'performance-2xl': ['dedicated', 100],
  'performance-l': ['dedicated', 50],
  'performance-l-ram': ['dedicated', 24],
  'performance-m': ['dedicated', 12],
  'performance-xl': ['dedicated', 50],
  'private-2xl': ['dedicated', 100],
  'private-l': ['dedicated', 50],
  'private-l-ram': ['dedicated', 24],
  'private-m': ['dedicated', 12],
  'private-s': ['dedicated', 12],
  'private-xl': ['dedicated', 50],
  'shield-2xl': ['dedicated', 100],
  'shield-l': ['dedicated', 50],
  'shield-l-ram': ['dedicated', 24],
  'shield-m': ['dedicated', 12],
  'shield-s': ['dedicated', 12],
  'shield-xl': ['dedicated', 50],
  'standard-1x': ['shared', 1],
  'standard-2x': ['shared', 2],
}

// Heroku CLI uses the same static monthly estimates in its ps:type command.
const COST_MONTHLY = {
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

export function memoryForSize(size) {
  const normalizedSize = size.toLowerCase()
  if (normalizedSize in DYNO_MEMORY_MB) return DYNO_MEMORY_MB[normalizedSize]

  const match = normalizedSize.match(/^dyno-\d+c-(\d+(?:\.\d+)?)gb$/)
  return match ? Number.parseFloat(match[1]) * 1024 : null
}

export function cpuForSize(size, quantity) {
  const normalizedSize = size.toLowerCase()
  const firMatch = normalizedSize.match(/^dyno-(\d+)c-/)
  if (firMatch) return `${Number.parseInt(firMatch[1], 10) * quantity} vCPU`

  const cpu = DYNO_CPU[normalizedSize]
  if (!cpu) return 'n/a'

  const [allocation, compute] = cpu
  if (allocation === 'shared') return `${compute * quantity}x shared`

  return `${quantity} dedicated (${compute * quantity}x)`
}

export function monthlyCostForSize(
  size,
  quantity,
  shielded,
) {
  const billingSize = shielded ? size.replace('Private-', 'Shield-') : size
  if (!(billingSize in COST_MONTHLY)) return {ecoPlan: false, monthlyCost: null}

  return {
    ecoPlan: billingSize === 'Eco',
    monthlyCost: COST_MONTHLY[billingSize] * quantity,
  }
}
