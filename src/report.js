import {normalizeAddonPlan} from './addon-plans.js'
import {cpuForSize, memoryForSize, monthlyCostForSize} from './specs.js'

export function buildReport(pipeline, stage, apps, dynoSizes) {
  const addons = []
  const rows = []
  let addonMonthlyCostCents = 0
  let addonUnknownCost = false
  let allocatedRamMb = 0
  let dynoCount = 0
  let estimatedMonthlyCost = 0
  let includesEcoPlan = false
  let unknownCost = false
  let unknownRam = false
  let upCount = 0

  for (const resources of [...apps].sort((left, right) => left.app.name.localeCompare(right.app.name))) {
    for (const addon of resources.addons ?? []) {
      const price = addon.billed_price ?? null
      const costCents = Number.isFinite(price?.cents) ? price.cents : null
      const costUnit = price?.unit ?? null
      const contract = price?.contract === true
      const metered = price?.metered === true
      const activePlan = addon.activePlan ?? null
      const providerStatus = addon.providerStatus ?? null
      const activePlanName = normalizeAddonPlan(activePlan)
      const targetPlanName = normalizeAddonPlan(addon.plan?.name) ?? normalizeAddonPlan(addon.plan?.human_name)
      const plansDiffer = Boolean(activePlanName && targetPlanName && activePlanName !== targetPlanName)
      const upgradePending = /^Upgrading Plan(?:\s*:|\s*$)/i.test(providerStatus ?? '')
      const planChangePending = upgradePending || plansDiffer

      addons.push({
        activePlan,
        app: resources.app.name,
        contract,
        costCents,
        costUnit,
        diskSize: addon.limits?.diskSize ?? null,
        maxConnections: addon.limits?.maxConnections ?? null,
        metered,
        name: addon.name,
        plan: addon.plan?.human_name ?? addon.plan?.name?.replace(/^[^:]+:/, '') ?? '?',
        planChangePending,
        providerStatus,
        ram: addon.limits?.ram ?? null,
        service: addon.addon_service?.human_name ?? addon.addon_service?.name ?? '?',
        state: upgradePending ? 'upgrade pending' : plansDiffer ? 'plan change pending' : addon.state ?? 'unknown',
      })

      if (costCents === null || costUnit !== 'month' || contract || metered) addonUnknownCost = true
      else addonMonthlyCostCents += costCents
    }

    if (resources.dynos.length === 0) {
      rows.push({
        app: resources.app.name,
        cpu: '-',
        dynoSize: '-',
        dynos: 0,
        ecoPlan: false,
        monthlyCost: 0,
        process: '(none)',
        ramPerDynoMb: null,
        up: 0,
      })
      continue
    }

    const groups = new Map()
    for (const dyno of resources.dynos) {
      const key = `${dyno.type}\0${dyno.size}`
      groups.set(key, [...(groups.get(key) ?? []), dyno])
    }
    const formationByType = new Map(resources.formation.map((formation) => [formation.type, formation]))

    for (const [key, dynos] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
      const [process, dynoSize] = key.split('\0')
      const quantity = dynos.length
      const up = dynos.filter((dyno) => dyno.state === 'up').length
      const shielded = resources.app.space?.shield === true
      const ramPerDynoMb = memoryForSize(dynoSize, shielded, dynoSizes)
      const formation = formationByType.get(process)
      const pricing = formation
        ? monthlyCostForSize(formation.size, formation.quantity, shielded, dynoSizes)
        : {ecoPlan: false, monthlyCost: null}

      rows.push({
        app: resources.app.name,
        cpu: cpuForSize(dynoSize, quantity, shielded, dynoSizes),
        dynoSize,
        dynos: quantity,
        ecoPlan: pricing.ecoPlan,
        monthlyCost: pricing.monthlyCost,
        process,
        ramPerDynoMb,
        up,
      })

      dynoCount += quantity
      upCount += up
      if (ramPerDynoMb === null) unknownRam = true
      else allocatedRamMb += ramPerDynoMb * quantity

      if (pricing.monthlyCost === null) unknownCost = true
      else estimatedMonthlyCost += pricing.monthlyCost
      includesEcoPlan ||= pricing.ecoPlan
    }
  }

  return {
    addonSummary: {
      addonCount: addons.length,
      estimatedMonthlyCostCents: addonMonthlyCostCents,
      unknownCost: addonUnknownCost,
    },
    addons: addons.sort((left, right) =>
      left.app.localeCompare(right.app)
      || left.service.localeCompare(right.service)
      || left.plan.localeCompare(right.plan)
      || left.name.localeCompare(right.name),
    ),
    pipeline,
    rows,
    stage,
    summary: {
      allocatedRamMb,
      appCount: apps.length,
      dynoCount,
      estimatedMonthlyCost,
      includesEcoPlan,
      unknownCost,
      unknownRam,
      upCount,
    },
  }
}
