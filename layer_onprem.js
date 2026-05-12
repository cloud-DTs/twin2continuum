"use strict";

/* OnPrem cost primitives (CLAUDE.md §A) and uniform per-layer cost (§B). */

const HOURS_PER_MONTH = 730;

function depreciationRate(t, depreciation) {
  if (depreciation.method === "exponential") {
    const r = depreciation.rate_oom_per_month;
    const ln10 = Math.log(10);
    return r * ln10 * Math.exp(-r * ln10 * t);
  }
  return 1 / depreciation.lifetime_months;
}

function cCapEx(node, t, depreciation) {
  const effective = {
    method: depreciation.method,
    lifetime_months: node.lifetime_months || depreciation.lifetime_months,
    rate_oom_per_month: depreciation.rate_oom_per_month,
  };
  const vs = node.salvage_eur_per_unit || 0;
  return (node.k_acq_eur - vs) * depreciationRate(t, effective);
}

function cOpEx(node, electricityRate, defaultPue) {
  const pue = (node.pue !== undefined && node.pue !== null) ? node.pue : defaultPue;
  const energyKwh = (node.power_w * HOURS_PER_MONTH) / 1000;
  const energyCost = electricityRate * energyKwh * pue;
  const nAssets = node.n_assets || 1;
  const mntCost = (node.maintenance_eur_per_month || 0) * nAssets;
  return energyCost + mntCost;
}

function cMgmtForLayer(layerCfg, node, costPerPmEur) {
  const tBaseline = layerCfg.t_baseline_pm || 0;
  const tPerUnit = layerCfg.t_per_unit_pm || 0;
  const nInfra = layerCfg.n_infra || 1;
  const tMaint = Math.max(tBaseline, tPerUnit * nInfra);
  const license = (node && node.license_eur_per_month) || 0;
  return tMaint * costPerPmEur + license;
}

function calculateOnPremLayerCost(layerKey, workload, onpremConfig, t) {
  if (t === undefined) t = 1;
  const layerCfg = onpremConfig && onpremConfig.layers && onpremConfig.layers[layerKey];
  if (!layerCfg) return { provider: "OnPrem", totalMonthlyCost: 0, capex: 0, opex: 0, mgmt: 0 };

  const node = onpremConfig.nodes && onpremConfig.nodes[layerCfg.node_ref];
  if (!node) {
    console.warn(`OnPrem: node "${layerCfg.node_ref}" not found for layer ${layerKey}`);
    return { provider: "OnPrem", totalMonthlyCost: 0, capex: 0, opex: 0, mgmt: 0 };
  }

  const nInfra = layerCfg.n_infra || 1;
  const rho = layerCfg.avg_usage !== undefined ? layerCfg.avg_usage : 1;
  const capexPerUnit = cCapEx(node, t, onpremConfig.depreciation);
  const opexPerUnit = cOpEx(node, onpremConfig.electricity_rate_eur_per_kwh, onpremConfig.default_pue);
  const mgmt = cMgmtForLayer(layerCfg, node, onpremConfig.cost_per_pm_eur);
  const capex = nInfra * rho * capexPerUnit;
  const opex = nInfra * rho * opexPerUnit;

  return {
    provider: "OnPrem",
    totalMonthlyCost: capex + opex + mgmt,
    capex,
    opex,
    mgmt,
  };
}

/* Placement-rule validation (CLAUDE.md §B).
   layersMap: { data_acquisition: bool, data_storage_hot: bool, ... }
              true = on-prem, false/missing = cloud.
   Returns { valid, errors }. */

function validateOnPremPlacement(layersMap) {
  const errors = [];
  const op = (key) => layersMap[key] === true;

  if (!op("data_storage_cold") && op("data_storage_archive")) {
    errors.push("L2-Archive cannot be on-prem if L2-Cold is in cloud (intra-L2 backbone is monotonic).");
  }

  const anyComputeCloud = !op("data_processing") || !op("dt_management") || !op("visualization");
  if (anyComputeCloud && op("data_storage_hot")) {
    errors.push("L2-Hot cannot be on-prem if any of L3 (processing), L4 (twin management), or L5 (visualization) is in cloud.");
  }

  const seq = ["data_acquisition", "data_processing", "dt_management", "visualization"];
  let sawCloud = false;
  for (const k of seq) {
    if (sawCloud && op(k)) {
      errors.push(`${k} cannot be on-prem because an earlier layer in the L1→L5 sequence is in cloud (monotonic rule).`);
    }
    if (!op(k)) sawCloud = true;
  }

  return { valid: errors.length === 0, errors };
}
