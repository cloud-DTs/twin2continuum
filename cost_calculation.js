"use strict";

let pricing;

async function loadPricingData() {
  try {
    const response = await fetch("./pricing.json");
    pricing = await response.json();
  } catch (error) {
    console.error("Error loading pricing data:", error);
  }
}

// Read OnPrem UI inputs into an in-memory config matching the pricing.json `onprem` shape.
// Returns null when the OnPrem checkbox is unchecked or absent — guarantees the
// existing cloud-only behaviour is unchanged when OnPrem mode is off.
function readOnpremConfig() {
  const checkbox = document.getElementById("onpremEnabled");
  if (!checkbox || !checkbox.checked) return null;

  const num = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el || el.value === "") return fallback;
    const v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  };
  const str = (id, fallback) => {
    const el = document.getElementById(id);
    return (el && el.value) ? el.value : fallback;
  };

  const defaults = (pricing && pricing.onprem) || {};
  const config = {
    depreciation: {
      method: str("opDepreciationMethod", (defaults.depreciation && defaults.depreciation.method) || "linear"),
      lifetime_months: num("opLifetimeMonths", (defaults.depreciation && defaults.depreciation.lifetime_months) || 60),
      rate_oom_per_month: num("opRateOomPerMonth", (defaults.depreciation && defaults.depreciation.rate_oom_per_month) || 0.01167),
    },
    default_pue: num("opDefaultPue", defaults.default_pue || 1.5),
    cost_per_pm_eur: num("opCostPerPmEur", defaults.cost_per_pm_eur || 8000),
    electricity_rate_eur_per_kwh: num("opElectricityRate", defaults.electricity_rate_eur_per_kwh || 0.28),
    analyzed_fraction: num("opAnalyzedFraction", 1.0),
    layers: {},
    nodes: {},
  };

  const cards = document.querySelectorAll(".onprem-server-card");
  cards.forEach((card) => {
    const layerKey = card.dataset.layerKey;
    if (!layerKey) return;
    const nodeRef = `${layerKey}_node`;
    const cardNum = (name, fallback) => {
      const el = card.querySelector(`[name="${name}"]`);
      if (!el || el.value === "") return fallback;
      const v = parseFloat(el.value);
      return isNaN(v) ? fallback : v;
    };
    config.layers[layerKey] = {
      service: card.dataset.service || "",
      node_ref: nodeRef,
      n_infra: Math.max(1, Math.floor(cardNum("n_infra", 1))),
      avg_usage: cardNum("avg_usage", 1.0),
      t_baseline_pm: cardNum("t_baseline_pm", 0),
      t_per_unit_pm: cardNum("t_per_unit_pm", 0),
    };
    config.nodes[nodeRef] = {
      k_acq_eur: cardNum("k_acq_eur", 0),
      n_assets: Math.max(1, Math.floor(cardNum("n_assets", 1))),
      salvage_eur_per_unit: cardNum("salvage_eur_per_unit", 0),
      lifetime_months: Math.max(1, Math.floor(cardNum("lifetime_months", config.depreciation.lifetime_months))),
      power_w: cardNum("power_w", 0),
      pue: cardNum("pue", config.default_pue),
      maintenance_eur_per_month: cardNum("maintenance_eur_per_month", 0),
      license_eur_per_month: cardNum("license_eur_per_month", 0),
    };
  });

  return config;
}

async function calculateCosts() {
  if (!pricing) {
    await loadPricingData();
  }
  const numberOfDevices = parseInt(document.getElementById("devices").value);
  const deviceSendingIntervalInMinutes = parseFloat(
    document.getElementById("interval").value
  );
  const averageSizeOfMessageInKb = parseFloat(
    document.getElementById("messageSize").value
  );
  const hotStorageDurationInMonths = parseInt(
    document.getElementById("hotStorageDurationInMonths").value
  );
  const coolStorageDurationInMonths = parseInt(
    document.getElementById("coolStorageDurationInMonths").value
  );
  const archiveStorageDurationInMonths = parseInt(
    document.getElementById("archiveStorageDurationInMonths").value
  );
  const needs3DModel = document.querySelector(
    'input[name="needs3DModel"]:checked'
  ).value;
  let entityCount = 0;
  if (needs3DModel === "yes") {
    entityCount = parseInt(document.getElementById("entityCount").value);
  }
  const amountOfActiveEditors = parseInt(
    document.getElementById("monthlyEditors").value
  );

  const amountOfActiveViewers = parseInt(
    document.getElementById("monthlyViewers").value
  );

  const dashboardRefreshesPerHour = parseInt(
    document.getElementById("dashboardRefreshesPerHour").value
  ); 

  const dashboardActiveHoursPerDay = parseInt(
    document.getElementById("dashboardActiveHoursPerDay").value
  ); 

  if (
    isNaN(numberOfDevices) ||
    isNaN(deviceSendingIntervalInMinutes) ||
    isNaN(averageSizeOfMessageInKb) ||
    numberOfDevices <= 0 ||
    deviceSendingIntervalInMinutes <= 0 ||
    averageSizeOfMessageInKb <= 0 ||
    isNaN(entityCount) ||
    isNaN(amountOfActiveEditors) ||
    isNaN(amountOfActiveViewers) ||
    amountOfActiveEditors < 0 ||
    amountOfActiveViewers < 0
  ) {
    document.getElementById("result").classList.remove("displayed");
    document.getElementById("result").innerHTML =
      "All inputs are required. Only positive values are allowed.";
    document.getElementById("result").classList.add("error");
    return;
  }

  if (hotStorageDurationInMonths > coolStorageDurationInMonths) {
    document.getElementById("result").classList.remove("displayed");
    document.getElementById("result").innerHTML =
      "Hot storage duration cannot be longer than cool storage duration.";
    document.getElementById("result").classList.add("error");
    return;
  }

  if (hotStorageDurationInMonths > archiveStorageDurationInMonths) {
    document.getElementById("result").classList.remove("displayed");
    document.getElementById("result").innerHTML =
      "Hot storage duration cannot be longer than archive storage duration.";
    document.getElementById("result").classList.add("error");
    return;
  }

  if (coolStorageDurationInMonths > archiveStorageDurationInMonths) {
    document.getElementById("result").classList.remove("displayed");
    document.getElementById("result").innerHTML =
      "Cool storage duration cannot be longer than archive storage duration.";
    document.getElementById("result").classList.add("error");
    return;
  }

  const awsResultDataAcquisition = calculateAWSCostDataAcquisition(
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    averageSizeOfMessageInKb
  );

  const azureResultDataAcquisition = calculateAzureCostDataAcquisition(
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    averageSizeOfMessageInKb
  );

  const awsResultDataProcessing = calculateAWSCostDataProcessing(
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    averageSizeOfMessageInKb
  );

  const azureResultDataProcessing = calculateAzureCostDataProcessing(
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    averageSizeOfMessageInKb
  );

  const transferCostFromL2AWSToAWSHot = calculateTransferCostFromL2AWSToAWSHot(
    awsResultDataProcessing.dataSizeInGB
  );

  const transferCostFromL2AWSToAzureHot =
    calculateTransferCostFromL2AWSToAzureHot(awsResultDataProcessing.dataSizeInGB);

  const transferCostFromL2AzureToAWSHot =
    calculateTransferCostFromL2AzureToAWSHot(azureResultDataProcessing.dataSizeInGB);

  const transferCostFromL2AzureToAzureHot =
    calculateTransferCostFromL2AzureToAzureHot(azureResultDataProcessing.dataSizeInGB);

  const awsResultHot = calculateDynamoDBCost(
    awsResultDataProcessing.dataSizeInGB,
    awsResultDataProcessing.totalMessagesPerMonth,
    averageSizeOfMessageInKb,
    hotStorageDurationInMonths
  );

  const azureResultHot = calculateCosmosDBCost(
    azureResultDataProcessing.dataSizeInGB,
    azureResultDataProcessing.totalMessagesPerMonth,
    averageSizeOfMessageInKb,
    hotStorageDurationInMonths
  );

  const transferCostFromAWSHotToAWSCool =
    calculateTransferCostFromAWSHotToAWSCool(awsResultHot.dataSizeInGB);

  const transferCostFromAWSHotToAzureCool =
    calculateTransferCostFromAWSHotToAzureCool(awsResultHot.dataSizeInGB);

  const transferCostFromAzureHotToAWSCool =
    calculateTransferCostsFromAzureHotToAWSCool(
      azureResultHot.dataSizeInGB
    );

  const transferCostFromAzureHotToAzureCool =
    calculateTransferCostFromAzureHotToAzureCool(
      azureResultHot.dataSizeInGB
    );

  const awsResultCool = calculateS3InfrequentAccessCost(
    awsResultHot.dataSizeInGB,
    coolStorageDurationInMonths
  );

  const azureResultLayer3Cool = calculateAzureBlobStorageCost(
    azureResultHot.dataSizeInGB,
    coolStorageDurationInMonths
  );

  const transferCostFromAWSCoolToAWSArchive =
    calculateTransferCostFromAWSCoolToAWSArchive(
      awsResultCool.dataSizeInGB
    );
  const transferCostFromAWSCoolToAzureArchive =
    calculateTransferCostFromAWSCoolToAzureArchive(
      awsResultCool.dataSizeInGB
    );
  const transferCostFromAzureCoolToAWSArchive =
    calculateTransferCostFromAzureCoolToAWSArchive(
      azureResultLayer3Cool.dataSizeInGB
    );
  const transferCostFromAzureCoolToAzureArchive =
    calculateTransferCostFromAzureCoolToAzureArchive(
      azureResultLayer3Cool.dataSizeInGB
    );

  const awsResultLayer3Archive = calculateS3GlacierDeepArchiveCost(
    awsResultCool.dataSizeInGB,
    archiveStorageDurationInMonths
  );

  const azureResultLayer3Archive = calculateAzureBlobStorageArchiveCost(
    azureResultLayer3Cool.dataSizeInGB,
    archiveStorageDurationInMonths
  );

  const awsResultLayer4 = calculateAWSIoTTwinMakerCost(
    entityCount,
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    dashboardRefreshesPerHour,
    dashboardActiveHoursPerDay
  );
  const azureResultLayer4 = calculateAzureDigitalTwinsCost(
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    averageSizeOfMessageInKb,
    dashboardRefreshesPerHour,
    dashboardActiveHoursPerDay
  );

  const awsResultLayer5 = calculateAmazonManagedGrafanaCost(
    amountOfActiveEditors,
    amountOfActiveViewers
  );

  const azureResultLayer5 = calculateAzureManagedGrafanaCost(
    amountOfActiveEditors + amountOfActiveViewers
  );

  // OnPrem extension: read user UI selections (returns null if checkbox unchecked
  // or UI not present, preserving exact existing behaviour).
  const onpremConfig = readOnpremConfig();
  const onpremPinned = (onpremConfig && onpremConfig.layers)
    ? Object.keys(onpremConfig.layers).reduce((acc, k) => { acc[k] = true; return acc; }, {})
    : {};

  // Compute actual on-prem layer costs for pinned (sub-)layers (added to total separately).
  const onpremCosts = {};
  if (onpremConfig) {
    for (const layerKey of Object.keys(onpremConfig.layers)) {
      onpremCosts[layerKey] = calculateOnPremLayerCost(layerKey, {}, onpremConfig);
    }
  }

  let transferCosts = {
    L1_AWS_to_AWS_Hot: transferCostFromL2AWSToAWSHot,
    L1_AWS_to_Azure_Hot: transferCostFromL2AWSToAzureHot,
    L1_Azure_to_AWS_Hot: transferCostFromL2AzureToAWSHot,
    L1_Azure_to_Azure_Hot: transferCostFromL2AzureToAzureHot,
    AWS_Hot_to_AWS_Cool: transferCostFromAWSHotToAWSCool,
    AWS_Hot_to_Azure_Cool: transferCostFromAWSHotToAzureCool,
    Azure_Hot_to_AWS_Cool: transferCostFromAzureHotToAWSCool,
    Azure_Hot_to_Azure_Cool: transferCostFromAzureHotToAzureCool,
    AWS_Cool_to_AWS_Archive: transferCostFromAWSCoolToAWSArchive,
    AWS_Cool_to_Azure_Archive: transferCostFromAWSCoolToAzureArchive,
    Azure_Cool_to_AWS_Archive: transferCostFromAzureCoolToAWSArchive,
    Azure_Cool_to_Azure_Archive: transferCostFromAzureCoolToAzureArchive,
    L2_AWS_Archive_to_L3_AWS: 0,
    L2_AWS_Archive_to_L3_Azure: 0,
    L2_Azure_Archive_to_L3_AWS: 0,
    L2_Azure_Archive_to_L3_Azure: 0,
    L3_AWS_to_L4_AWS: 0,
    L3_AWS_to_L4_Azure: calculateTransferCostFromL3AWSToL4Azure(awsResultDataProcessing.dataSizeInGB),
    L3_Azure_to_L4_AWS: calculateTransferCostFromL3AzureToL4AWS(azureResultDataProcessing.dataSizeInGB),
    L3_Azure_to_L4_Azure: 0,
    L4_AWS_to_L5_AWS: 0,
    L4_Azure_to_L5_Azure: 0,
  };

  // OnPrem cross-domain transfer entries (used by the extended Dijkstra graph
  // and by the L1 provider pick when L1 is cloud and Hot is OnPrem).
  if (onpremConfig) {
    // L3 → L4 OnPrem-touching variants (OnPrem-touching = 0 by convention)
    transferCosts.L3_AWS_to_L4_OnPrem = 0;
    transferCosts.L3_Azure_to_L4_OnPrem = 0;
    transferCosts.L3_OnPrem_to_L4_AWS = 0;
    transferCosts.L3_OnPrem_to_L4_Azure = 0;
    transferCosts.L3_OnPrem_to_L4_OnPrem = 0;

    transferCosts.L1_AWS_to_OnPrem_Hot = calculateTransferCostFromL2AWSToOnPremHot(awsResultDataProcessing.dataSizeInGB);
    transferCosts.L1_Azure_to_OnPrem_Hot = calculateTransferCostFromL2AzureToOnPremHot(azureResultDataProcessing.dataSizeInGB);
    transferCosts.L1_OnPrem_to_AWS_Hot = 0;
    transferCosts.L1_OnPrem_to_Azure_Hot = 0;
    transferCosts.L1_OnPrem_to_OnPrem_Hot = 0;
    transferCosts.AWS_Hot_to_OnPrem_Cool = calculateTransferCostFromAWSHotToOnPremCool(awsResultHot.dataSizeInGB);
    transferCosts.Azure_Hot_to_OnPrem_Cool = calculateTransferCostFromAzureHotToOnPremCool(azureResultHot.dataSizeInGB);
    transferCosts.OnPrem_Hot_to_AWS_Cool = 0;
    transferCosts.OnPrem_Hot_to_Azure_Cool = 0;
    transferCosts.OnPrem_Hot_to_OnPrem_Cool = 0;
    transferCosts.AWS_Cool_to_OnPrem_Archive = calculateTransferCostFromAWSCoolToOnPremArchive(awsResultCool.dataSizeInGB);
    transferCosts.Azure_Cool_to_OnPrem_Archive = calculateTransferCostFromAzureCoolToOnPremArchive(azureResultLayer3Cool.dataSizeInGB);
    transferCosts.OnPrem_Cool_to_AWS_Archive = 0;
    transferCosts.OnPrem_Cool_to_Azure_Archive = 0;
    transferCosts.OnPrem_Cool_to_OnPrem_Archive = 0;
  }

  let graph = buildGraphForStorage(
    awsResultHot,
    azureResultHot,
    awsResultCool,
    azureResultLayer3Cool,
    awsResultLayer3Archive,
    azureResultLayer3Archive,
    transferCosts,
    onpremConfig ? { onpremEnabled: true } : undefined
  );

  // Pin storage tiers per the user's on-prem selections by setting the
  // not-allowed nodes' costs to Infinity (the user has decided per-tier;
  // the Dijkstra is just picking AWS vs Azure for the cloud-assigned tiers).
  if (onpremConfig) {
    if (onpremPinned.data_storage_hot) {
      if (graph.AWS_Hot) graph.AWS_Hot.costs = Infinity;
      if (graph.Azure_Hot) graph.Azure_Hot.costs = Infinity;
    } else if (graph.OnPrem_Hot) {
      graph.OnPrem_Hot.costs = Infinity;
    }
    if (onpremPinned.data_storage_cold) {
      if (graph.AWS_Cool) graph.AWS_Cool.costs = Infinity;
      if (graph.Azure_Cool) graph.Azure_Cool.costs = Infinity;
    } else if (graph.OnPrem_Cool) {
      graph.OnPrem_Cool.costs = Infinity;
    }
    if (onpremPinned.data_storage_archive) {
      if (graph.AWS_Archive) graph.AWS_Archive.costs = Infinity;
      if (graph.Azure_Archive) graph.Azure_Archive.costs = Infinity;
    } else if (graph.OnPrem_Archive) {
      graph.OnPrem_Archive.costs = Infinity;
    }
  }

  let storageStartNodes = onpremPinned.data_storage_hot ? ["OnPrem_Hot"] : ["AWS_Hot", "Azure_Hot"];
  let storageEndNodes = onpremPinned.data_storage_archive ? ["OnPrem_Archive"] : ["AWS_Archive", "Azure_Archive"];

  let cheapestStorage = findCheapestStoragePath(
    graph,
    storageStartNodes,
    storageEndNodes
  );

  const awsCostsAfterLayer1 = awsResultDataAcquisition.totalMonthlyCost;
  const azureCostsAfterLayer1 = azureResultDataAcquisition.totalMonthlyCost;


  let cheaperProviderForLayer1;
  let cheaperProviderForLayer3;
  if (onpremPinned.data_acquisition) {
    cheaperProviderForLayer1 = "L1_OnPrem";
  }
  if (onpremPinned.data_processing) {
    cheaperProviderForLayer3 = "L3_OnPrem";
  }
  switch (cheapestStorage.path[0]) {
    case "AWS_Hot":
      if (!cheaperProviderForLayer1) {
        cheaperProviderForLayer1 =
          awsCostsAfterLayer1 + transferCosts.L1_AWS_to_AWS_Hot <
          azureCostsAfterLayer1 + transferCosts.L1_Azure_to_AWS_Hot
            ? "L1_AWS"
            : "L1_Azure";
      }
      if (!cheaperProviderForLayer3) cheaperProviderForLayer3 = "L3_AWS";
      break;
    case "Azure_Hot":
      if (!cheaperProviderForLayer1) {
        cheaperProviderForLayer1 =
          awsCostsAfterLayer1 + transferCosts.L1_AWS_to_Azure_Hot <
          azureCostsAfterLayer1 + transferCosts.L1_Azure_to_Azure_Hot
            ? "L1_AWS"
            : "L1_Azure";
      }
      if (!cheaperProviderForLayer3) cheaperProviderForLayer3 = "L3_Azure";
      break;
    case "OnPrem_Hot":
      // Hot is OnPrem; L1 (if cloud) compares cloud + transfer to OnPrem_Hot;
      // L3 (if cloud) just picks the cheaper cloud since L3 has no transfer-cost
      // coupling to Hot in the existing model.
      if (!cheaperProviderForLayer1) {
        cheaperProviderForLayer1 =
          awsCostsAfterLayer1 + transferCosts.L1_AWS_to_OnPrem_Hot <
          azureCostsAfterLayer1 + transferCosts.L1_Azure_to_OnPrem_Hot
            ? "L1_AWS"
            : "L1_Azure";
      }
      if (!cheaperProviderForLayer3) {
        cheaperProviderForLayer3 =
          awsResultDataProcessing.totalMonthlyCost < azureResultDataProcessing.totalMonthlyCost
            ? "L3_AWS"
            : "L3_Azure";
      }
      break;
    default:
      console.log("Storage Path incorrect!");
  }

  let cheaperProviderLayer5;
  if (onpremPinned.visualization) {
    cheaperProviderLayer5 = "L5_OnPrem";
  } else {
    cheaperProviderLayer5 =
      awsResultLayer5.totalMonthlyCost < azureResultLayer5.totalMonthlyCost
        ? "L5_AWS"
        : "L5_Azure";
  }

  let cheapestPath = [];

  cheapestPath.push(cheaperProviderForLayer1);
  cheapestStorage.path.map((x) => "L2_" + x).forEach((x) => cheapestPath.push(x));
  cheapestPath.push(cheaperProviderForLayer3);

  let cheaperProviderLayer4 = "";
  if (onpremPinned.dt_management) {
    cheaperProviderLayer4 = "L4_OnPrem";
  } else if (needs3DModel === "no") {
    cheaperProviderLayer4 = azureResultLayer4.totalMonthlyCost < awsResultLayer4.totalMonthlyCost ? "L4_Azure" : "L4_AWS";
  } else {
    cheaperProviderLayer4 = "L4_AWS";
  }

  cheapestPath.push(cheaperProviderLayer4);
  cheapestPath.push(cheaperProviderLayer5);
  let formattedCheapestPath = cheapestPath
    .map((segment) => {
          const isOnPrem = segment && segment.includes("OnPrem");
      const cls = isOnPrem ? "path-segment path-segment-onprem" : "path-segment";
      return `<span class="${cls}">${segment}</span>`;
    })
    .join('<span class="arrow">→</span>');

  // Helper: render the on-prem cost row for a card if that layer is pinned.
  const opRow = (layerKey) => {
    if (!onpremCosts[layerKey]) return "";
    return `<p><strong>On-prem:</strong> <span class="total-cost total-cost-onprem">$${onpremCosts[layerKey].totalMonthlyCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>`;
  };

  // Total deployment cost of the chosen configuration (sum of selected providers' costs).
  const pickedCloud = (choice, awsCost, azureCost) => {
    if (!choice || choice.endsWith("_OnPrem")) return 0;
    if (choice.endsWith("_AWS")) return awsCost;
    if (choice.endsWith("_Azure")) return azureCost;
    return 0;
  };
  const l1ChosenCost = pickedCloud(cheaperProviderForLayer1, awsResultDataAcquisition.totalMonthlyCost, azureResultDataAcquisition.totalMonthlyCost);
  const l3ChosenCost = pickedCloud(cheaperProviderForLayer3, awsResultDataProcessing.totalMonthlyCost, azureResultDataProcessing.totalMonthlyCost);
  const l4ChosenCost = pickedCloud(cheaperProviderLayer4, awsResultLayer4.totalMonthlyCost, azureResultLayer4.totalMonthlyCost);
  const l5ChosenCost = pickedCloud(cheaperProviderLayer5, awsResultLayer5.totalMonthlyCost, azureResultLayer5.totalMonthlyCost);
  let onpremTotal = 0;
  for (const k of Object.keys(onpremCosts)) onpremTotal += onpremCosts[k].totalMonthlyCost;

  const l1ToHotKey = `${cheaperProviderForLayer1}_to_${cheapestStorage.path[0]}`;
  const l1ToHotTransfer = transferCosts[l1ToHotKey] !== undefined ? transferCosts[l1ToHotKey] : 0;
  const l3ToL4Key = `${cheaperProviderForLayer3}_to_${cheaperProviderLayer4}`;
  const l3ToL4Transfer = transferCosts[l3ToL4Key] !== undefined ? transferCosts[l3ToL4Key] : 0;

  // L3→L4 transfer is excluded: L4 per-message API pricing already captures
  // the per-query cost of reading L3 output, so adding egress would double-count.
  const totalDeploymentCost =
    cheapestStorage.cost + l1ToHotTransfer +
    l1ChosenCost + l3ChosenCost + l4ChosenCost + l5ChosenCost +
    onpremTotal;
  const cloudTotal = totalDeploymentCost - onpremTotal;
  const totalSummary = `<div class="total-summary"><strong>Total monthly cost (chosen configuration):</strong> $${totalDeploymentCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${onpremConfig ? ` <span class="onprem-breakdown">(on-prem portion: $${onpremTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>` : ""}</div>`;

  const fmt = (n) => (typeof n === "number" ? n.toFixed(4) : n);
  console.group("%c🧾 Twin2Clouds cost breakdown", "font-weight: bold; color: #2c5282");

  console.group("Workload");
  console.table({
    numberOfDevices,
    deviceSendingIntervalInMinutes,
    averageSizeOfMessageInKb,
    hotStorageDurationInMonths,
    coolStorageDurationInMonths,
    archiveStorageDurationInMonths,
    needs3DModel,
    entityCount,
    monthlyEditors: amountOfActiveEditors,
    monthlyViewers: amountOfActiveViewers,
    dashboardRefreshesPerHour,
    dashboardActiveHoursPerDay,
  });
  console.groupEnd();

  console.group("Per-layer cloud cost (€/month)");
  console.table({
    "L1 Data Acquisition":     { AWS: fmt(awsResultDataAcquisition.totalMonthlyCost), Azure: fmt(azureResultDataAcquisition.totalMonthlyCost) },
    "L2 Hot Storage":          { AWS: fmt(awsResultHot.totalMonthlyCost),              Azure: fmt(azureResultHot.totalMonthlyCost) },
    "L2 Cool Storage":         { AWS: fmt(awsResultCool.totalMonthlyCost),             Azure: fmt(azureResultLayer3Cool.totalMonthlyCost) },
    "L2 Archive Storage":      { AWS: fmt(awsResultLayer3Archive.totalMonthlyCost),    Azure: fmt(azureResultLayer3Archive.totalMonthlyCost) },
    "L3 Data Processing":      { AWS: fmt(awsResultDataProcessing.totalMonthlyCost),   Azure: fmt(azureResultDataProcessing.totalMonthlyCost) },
    "L4 Twin Management":      { AWS: fmt(awsResultLayer4.totalMonthlyCost), Azure: fmt(azureResultLayer4.totalMonthlyCost) },
    "L5 Visualization":        { AWS: fmt(awsResultLayer5.totalMonthlyCost),           Azure: fmt(azureResultLayer5.totalMonthlyCost) },
  });
  console.groupEnd();

  if (onpremConfig) {
    console.group("OnPrem layer cost (€/month, computed via N_infra · ρ · (CapEx+OpEx) + C_Mgmt)");
    const opTable = {};
    for (const [k, v] of Object.entries(onpremCosts)) {
      opTable[k] = { capex: fmt(v.capex), opex: fmt(v.opex), mgmt: fmt(v.mgmt), total: fmt(v.totalMonthlyCost) };
    }
    console.table(opTable);
    console.groupEnd();
  }

  console.group("Transfer cost matrix (€/month over chosen data volumes)");
  console.table(Object.fromEntries(Object.entries(transferCosts).map(([k, v]) => [k, fmt(v)])));
  console.groupEnd();

  console.group("Storage Dijkstra");
  console.log("Candidate start nodes:", storageStartNodes.join(", "));
  console.log("Candidate end nodes:  ", storageEndNodes.join(", "));
  console.log("Cheapest path:        ", cheapestStorage.path.join(" → "));
  console.log("Path cost:             €", fmt(cheapestStorage.cost), "(storage tier costs + intra-path transfers)");
  console.groupEnd();

  console.group("Selected providers");
  console.log("L1:", cheaperProviderForLayer1, "→ €", fmt(l1ChosenCost), "(L1→Hot transfer: €", fmt(l1ToHotTransfer) + ")");
  console.log("L2:", cheapestStorage.path.join(" → "), "→ €", fmt(cheapestStorage.cost));
  console.log("L3:", cheaperProviderForLayer3, "→ €", fmt(l3ChosenCost), "(L3→L4 transfer: €", fmt(l3ToL4Transfer) + ")");
  console.log("L4:", cheaperProviderLayer4,    "→ €", fmt(l4ChosenCost));
  console.log("L5:", cheaperProviderLayer5,    "→ €", fmt(l5ChosenCost));
  if (onpremConfig) console.log("OnPrem actual sum: €", fmt(onpremTotal));
  console.groupEnd();

  const awsOnlyStorage = awsResultHot.totalMonthlyCost
    + transferCosts.AWS_Hot_to_AWS_Cool
    + awsResultCool.totalMonthlyCost
    + awsResultLayer3Archive.totalMonthlyCost;
  const azureOnlyStorage = azureResultHot.totalMonthlyCost
    + transferCosts.Azure_Hot_to_Azure_Cool
    + azureResultLayer3Cool.totalMonthlyCost
    + azureResultLayer3Archive.totalMonthlyCost;
  const awsOnlyTotal = awsResultDataAcquisition.totalMonthlyCost
    + awsOnlyStorage
    + awsResultDataProcessing.totalMonthlyCost
    + (awsResultLayer4 ? awsResultLayer4.totalMonthlyCost : 0)
    + awsResultLayer5.totalMonthlyCost;
  const azureOnlyTotal = azureResultDataAcquisition.totalMonthlyCost
    + azureOnlyStorage
    + azureResultDataProcessing.totalMonthlyCost
    + azureResultLayer4.totalMonthlyCost
    + azureResultLayer5.totalMonthlyCost;
  console.group("Single-cloud vs. optimized (€/month)");
  console.table({
    "All-AWS":   { total: fmt(awsOnlyTotal) },
    "All-Azure": { total: fmt(azureOnlyTotal) },
    "Optimized": { total: fmt(totalDeploymentCost) },
  });
  console.groupEnd();

  console.log(
    "%cTOTAL MONTHLY COST: € " + totalDeploymentCost.toFixed(2) +
    (onpremConfig ? `  (cloud: € ${cloudTotal.toFixed(2)}  +  on-prem: € ${onpremTotal.toFixed(2)})` : ""),
    "font-weight: bold; font-size: 13px; color: #2c5282"
  );
  console.groupEnd();

  let resultHTML = `
  <h2>Your most cost-efficient Digital Twin solution</h2>

  <div id="optimal-path">
    <div class="path-container">${formattedCheapestPath}</div>
    ${totalSummary}
  </div>

  <div class="cost-container">
    <!-- Layer 1 -->
    <div class="cost-card">
        <h3>Layer 1: Data Acquisition</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultDataAcquisition.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        <p><strong>Azure:</strong> <span class="total-cost">$${azureResultDataAcquisition.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${opRow("data_acquisition")}
    </div>

    <!-- Layer 2 Hot Storage -->
    <div class="cost-card">
        <h3>Layer 2: Hot Storage</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultHot.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        <p><strong>Azure:</strong> <span class="total-cost">$${azureResultHot.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${opRow("data_storage_hot")}
    </div>

        <!-- Layer 2 Cool Storage -->
    <div class="cost-card">
        <h3>Layer 2: Cool Storage</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultCool.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        <p><strong>Azure:</strong> <span class="total-cost">$${azureResultLayer3Cool.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${opRow("data_storage_cold")}
    </div>

    <!-- Layer 2 Archive Storage -->
    <div class="cost-card">
        <h3>Layer 2: Archive Storage</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultLayer3Archive.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        <p><strong>Azure:</strong> <span class="total-cost">$${azureResultLayer3Archive.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${opRow("data_storage_archive")}
    </div>

    <!-- Layer 3 -->
    <div class="cost-card">
        <h3>Layer 3: Data Processing</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultDataProcessing.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        <p><strong>Azure:</strong> <span class="total-cost">$${azureResultDataProcessing.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${opRow("data_processing")}
    </div>

    <div class="cost-card">
        <h3>Layer 4: Twin Management</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultLayer4.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${needs3DModel === "no" ? `<p><strong>Azure:</strong> <span class="total-cost">$${azureResultLayer4.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>` : ""}
        ${opRow("dt_management")}
    </div>


        <!-- Layer 5 -->
    <div class="cost-card">
        <h3>Layer 5: Data Visualization</h3>
        <p><strong>AWS:</strong> <span class="total-cost">$${awsResultLayer5.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        <p><strong>Azure:</strong> <span class="total-cost">$${azureResultLayer5.totalMonthlyCost.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</span></p>
        ${opRow("visualization")}
    </div>

    
  </div>`;

  document.getElementById("result").classList.remove("error");
  document.getElementById("result").innerHTML = resultHTML;
}
