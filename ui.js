"use strict";

function updateSliderStyle(slider) {
  let min = slider.min;
  let max = slider.max;
  let value = slider.value;

  let percentage = ((value - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(90deg, #007bff ${percentage}%, #ddd ${percentage}%)`;
  let output = slider.nextElementSibling;
  output.textContent = value;
  output.style.left = `calc(${percentage}% - 12px)`;
}

// Ensure the slider starts with the correct style on page load
document.addEventListener("DOMContentLoaded", function () {
  const hotSlider = document.getElementById("hotStorageDurationInMonths");
  const coolSlider = document.getElementById("coolStorageDurationInMonths");
  const archiveSlider = document.getElementById(
    "archiveStorageDurationInMonths"
  );
  const dashboardActiveHoursPerDaySlider = document.getElementById("dashboardActiveHoursPerDay");
  updateSliderStyle(hotSlider);
  updateSliderStyle(coolSlider);
  updateSliderStyle(archiveSlider);
  updateSliderStyle(dashboardActiveHoursPerDaySlider); 
});

function fillScenario(
  devices,
  interval,
  messageSize,
  hotStorageMonths,
  coolStorageMonths,
  archiveStorageMonths,
  needs3DModel,
  numberOfEntities,
  amountOfActiveEditors,
  amountOfActiveViewers, 
  dashboardRefreshesPerHour, 
  dashboardActiveHoursPerDay
) {
  document.getElementById("devices").value = devices;
  document.getElementById("interval").value = interval;
  document.getElementById("messageSize").value = messageSize;
  document.getElementById("hotStorageDurationInMonths").value =
    hotStorageMonths;
  document.getElementById("coolStorageDurationInMonths").value =
    coolStorageMonths;
  document.getElementById("archiveStorageDurationInMonths").value =
    archiveStorageMonths;
  if (needs3DModel === "yes") {
    document.getElementById("modelYes").checked = true;
    document.getElementById("modelNo").checked = false;
    entityInputContainer.classList.add("visible");
  } else {
    document.getElementById("modelYes").checked = false;
    document.getElementById("modelNo").checked = true;
    entityInputContainer.classList.remove("visible");
  }
  document.getElementById("monthlyEditors").value = amountOfActiveEditors;
  document.getElementById("monthlyViewers").value = amountOfActiveViewers;

  document.getElementById("entityCount").value = numberOfEntities;

  document.getElementById("dashboardRefreshesPerHour").value = dashboardRefreshesPerHour; 
  document.getElementById("dashboardActiveHoursPerDay").value = dashboardActiveHoursPerDay; 


  // Update slider UI
  updateSliderStyle(document.getElementById("hotStorageDurationInMonths"));
  updateSliderStyle(document.getElementById("coolStorageDurationInMonths"));
  updateSliderStyle(document.getElementById("archiveStorageDurationInMonths"));
  updateSliderStyle(document.getElementById("dashboardActiveHoursPerDay"));
}

// Ensure entity input toggles based on selection
function toggleEntityInput() {
  const needs3DModel = document.querySelector(
    'input[name="needs3DModel"]:checked'
  ).value;
  const entityInputContainer = document.getElementById("entityInputContainer");

  if (needs3DModel === "yes") {
    entityInputContainer.classList.add("visible");
  } else {
    entityInputContainer.classList.remove("visible");
  }
}

// Ensure the correct state on page load
document.addEventListener("DOMContentLoaded", toggleEntityInput);

/* === OnPrem section === */

// Layer add-order. The "+ Add server" button advances through this sequence.
// Hot is intentionally last because the spec forces Hot=cloud whenever any of
// L3/L4/L5 is cloud — putting Hot at the end means the user only adds it once
// they've already pinned L3, L4, AND L5 on-prem, so the rule is satisfied by
// construction. Cold is before Archive to enforce the intra-L2 monotonic rule
// (Cold cloud ⟹ Archive cloud) by ordering of choice.
const ONPREM_LAYER_SEQUENCE = [
  { key: "data_acquisition",     label: "Layer 1: Data Acquisition" },
  { key: "data_storage_cold",    label: "Layer 2: Cool Storage" },
  { key: "data_storage_archive", label: "Layer 2: Archive Storage" },
  { key: "data_processing",      label: "Layer 3: Data Processing" },
  { key: "dt_management",        label: "Layer 4: Twin Management" },
  { key: "visualization",        label: "Layer 5: Visualization" },
  { key: "data_storage_hot",     label: "Layer 2: Hot Storage" },
];

function toggleOnPremSection() {
  const checkbox = document.getElementById("onpremEnabled");
  const section = document.getElementById("onpremSection");
  if (!checkbox || !section) return;
  section.style.display = checkbox.checked ? "block" : "none";
  if (checkbox.checked) {
    // Initialize the analyzed-fraction slider on first reveal.
    const slider = document.getElementById("opAnalyzedFraction");
    if (slider && typeof updateSliderStyle === "function") updateSliderStyle(slider);
  }
}

function getCurrentOnpremLayerKeys() {
  const cards = document.querySelectorAll("#onpremServerCards .onprem-server-card");
  return Array.from(cards).map((c) => c.dataset.layerKey);
}

function nextOnpremLayer() {
  const present = new Set(getCurrentOnpremLayerKeys());
  return ONPREM_LAYER_SEQUENCE.find((l) => !present.has(l.key)) || null;
}

function defaultsForLayer(layerKey) {
  // Pull defaults from pricing.json's onprem block (loaded into `pricing` global).
  if (typeof pricing === "undefined" || !pricing.onprem) return null;
  const layerCfg = pricing.onprem.layers[layerKey];
  if (!layerCfg) return null;
  const node = pricing.onprem.nodes[layerCfg.node_ref] || {};
  return { layer: layerCfg, node };
}

function renderOnpremCard(layerSpec) {
  const d = defaultsForLayer(layerSpec.key);
  const layer = d ? d.layer : { n_infra: 1, avg_usage: 1, t_baseline_pm: 0.05, t_per_unit_pm: 0.01, service: "" };
  const node = d ? d.node : { k_acq_eur: 0, n_assets: 1, salvage_eur_per_unit: 0, lifetime_months: 60, power_w: 0, pue: 1.5, maintenance_eur_per_month: 0, license_eur_per_month: 0 };

  const div = document.createElement("div");
  div.className = "onprem-server-card";
  div.dataset.layerKey = layerSpec.key;
  div.dataset.service = layer.service || "";
  div.innerHTML = `
    <h4>${layerSpec.label} <small>(on-prem)</small></h4>
    ${layer.service ? `<p class="onprem-service-hint">${layer.service}</p>` : ""}
    <div class="onprem-card-grid">
      <label>Number of units (N_infra):
        <input type="number" name="n_infra" value="${layer.n_infra}" min="1" step="1" />
      </label>
      <label>Average usage (ρ, 0–1):
        <input type="number" name="avg_usage" value="${layer.avg_usage}" min="0" max="1" step="0.05" />
      </label>
      <label>Acquisition cost per unit (€):
        <input type="number" name="k_acq_eur" value="${node.k_acq_eur}" min="0" />
      </label>
      <label>Salvage per unit (€):
        <input type="number" name="salvage_eur_per_unit" value="${node.salvage_eur_per_unit}" min="0" />
      </label>
      <label>Useful lifetime (months):
        <input type="number" name="lifetime_months" value="${node.lifetime_months}" min="1" step="1" />
      </label>
      <label>Power per unit (W):
        <input type="number" name="power_w" value="${node.power_w}" min="0" />
      </label>
      <label>Power usage effectiveness:
        <input type="number" name="pue" value="${node.pue}" min="1" step="0.1" />
      </label>
      <label>Maintenance contract (€/month):
        <input type="number" name="maintenance_eur_per_month" value="${node.maintenance_eur_per_month}" min="0" />
      </label>
      <label>Software license (€/month):
        <input type="number" name="license_eur_per_month" value="${node.license_eur_per_month}" min="0" />
      </label>
      <label>Baseline maintenance (PM/month):
        <input type="number" name="t_baseline_pm" value="${layer.t_baseline_pm}" min="0" step="0.01" />
      </label>
      <label>Per-unit maintenance (PM/unit/month):
        <input type="number" name="t_per_unit_pm" value="${layer.t_per_unit_pm}" min="0" step="0.01" />
      </label>
    </div>
  `;
  return div;
}

function refreshAddButton() {
  const btn = document.getElementById("addServerBtn");
  const removeBtn = document.getElementById("removeLastServerBtn");
  const errEl = document.getElementById("onpremPlacementError");
  if (!btn) return;

  const next = nextOnpremLayer();
  if (next) {
    btn.disabled = false;
    btn.textContent = `+ Add server (${next.label})`;
  } else {
    btn.disabled = true;
    btn.textContent = "All layers added";
  }

  const present = getCurrentOnpremLayerKeys();
  if (removeBtn) removeBtn.disabled = present.length === 0;

  // Live placement validation if validator is loaded.
  if (typeof validateOnPremPlacement === "function") {
    const map = {};
    for (const k of present) map[k] = true;
    const v = validateOnPremPlacement(map);
    if (errEl) errEl.textContent = v.valid ? "" : v.errors.join(" ");
  }
}

function addServerCard() {
  const next = nextOnpremLayer();
  if (!next) return;
  const container = document.getElementById("onpremServerCards");
  if (!container) return;
  container.appendChild(renderOnpremCard(next));
  refreshAddButton();
}

function removeLastServerCard() {
  const container = document.getElementById("onpremServerCards");
  if (!container) return;
  const last = container.lastElementChild;
  if (last) container.removeChild(last);
  refreshAddButton();
}

document.addEventListener("DOMContentLoaded", () => {
  // Hide OnPrem section by default; refresh the add button label.
  toggleOnPremSection();
  refreshAddButton();
});

/* === OnPrem-aware presets === */

function setOnpremGlobals(globals) {
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v !== undefined) el.value = v;
  };
  set("opDepreciationMethod", globals.method);
  set("opLifetimeMonths", globals.lifetimeMonths);
  set("opRateOomPerMonth", globals.rateOomPerMonth);
  set("opCostPerPmEur", globals.costPerPmEur);
  set("opElectricityRate", globals.electricityRate);
  set("opDefaultPue", globals.defaultPue);
  if (globals.analyzedFraction !== undefined) {
    const slider = document.getElementById("opAnalyzedFraction");
    if (slider) {
      slider.value = globals.analyzedFraction;
      if (typeof updateSliderStyle === "function") updateSliderStyle(slider);
    }
  }
}

function applyCardOverrides(layerKey, overrides) {
  const card = document.querySelector(`#onpremServerCards .onprem-server-card[data-layer-key="${layerKey}"]`);
  if (!card || !overrides) return;
  for (const [name, value] of Object.entries(overrides)) {
    const input = card.querySelector(`[name="${name}"]`);
    if (input && value !== undefined) input.value = value;
  }
}

function applyOnpremPreset(layerKeys, globals, perLayerOverrides) {
  // Enable OnPrem section + clear any existing cards.
  const cb = document.getElementById("onpremEnabled");
  if (cb) cb.checked = true;
  toggleOnPremSection();
  const container = document.getElementById("onpremServerCards");
  if (container) container.innerHTML = "";

  setOnpremGlobals(globals);

  // Add cards in canonical sequence (skipping any not in the requested set).
  // The current UI's "+ Add server" advances strictly through ONPREM_LAYER_SEQUENCE,
  // so we use the same path here — call addServerCard() once per layer in the set,
  // then apply per-card overrides.
  const requested = new Set(layerKeys);
  for (const layer of ONPREM_LAYER_SEQUENCE) {
    if (!requested.has(layer.key)) continue;
    addServerCard();
    if (perLayerOverrides && perLayerOverrides[layer.key]) {
      applyCardOverrides(layer.key, perLayerOverrides[layer.key]);
    }
  }
  refreshAddButton();
}

// Hybrid Siemens microgrid: acquisition + all storage + processing + DT mgmt on-prem;
// visualization in cloud (lets the dashboard live wherever it's cheapest).
function fillScenarioHybridSiemens() {
  fillScenario(
    /* devices */ 100,
    /* interval (min) */ 1,
    /* msg size (KB) */ 0.5,
    /* hot months */ 3,
    /* cool months */ 12,
    /* archive months */ 36,
    /* needs3DModel */ "no",
    /* entityCount */ 0,
    /* monthlyEditors */ 5,
    /* monthlyViewers */ 50,
    /* dashboardRefreshes */ 12,
    /* dashboardActiveHours */ 8
  );
  // L2-Hot intentionally NOT in this set: with L5 (visualization) cloud, the
  // Hot-affinity rule forces Hot=cloud anyway. Aligns with the spec §H Siemens
  // guess and matches the user's worked example (L1 + L2-Cold + L2-Archive +
  // L3 + L4 on-prem; Hot+L5 cloud).
  applyOnpremPreset(
    ["data_acquisition", "data_storage_cold", "data_storage_archive", "data_processing", "dt_management"],
    {
      method: "linear",
      lifetimeMonths: 60,
      rateOomPerMonth: 0.01167,
      costPerPmEur: 8000,
      electricityRate: 0.28,
      defaultPue: 1.5,
      analyzedFraction: parseFloat((1 / 15).toFixed(4)),
    },
    {}
  );
}

// CheckWatt aggregator: hardware-edge-only — only L1 on-prem (CM10+Acuvim per
// household); all downstream layers cloud-optimized. Electricity externalized to
// householder so c_pwr = 0 for the operator. SIM data plan (€3/unit/month)
// folded into maintenance_eur_per_month.
function fillScenarioCheckWatt() {
  fillScenario(
    /* devices */ 5000,
    /* interval (min) */ 5,
    /* msg size (KB) */ 1,
    /* hot months */ 1,
    /* cool months */ 6,
    /* archive months */ 24,
    /* needs3DModel */ "no",
    /* entityCount */ 0,
    /* monthlyEditors */ 2,
    /* monthlyViewers */ 20,
    /* dashboardRefreshes */ 4,
    /* dashboardActiveHours */ 4
  );
  applyOnpremPreset(
    ["data_acquisition"],
    {
      method: "linear",
      lifetimeMonths: 84,
      rateOomPerMonth: 0.01167,
      costPerPmEur: 6000,
      electricityRate: 0,
      defaultPue: 1.0,
      analyzedFraction: 1.0,
    },
    {
      data_acquisition: {
        n_infra: 5000,
        avg_usage: 1.0,
        t_baseline_pm: 1.5,
        t_per_unit_pm: 0.0005,
        k_acq_eur: 600,
        salvage_eur_per_unit: 0,
        lifetime_months: 84,
        power_w: 8,
        pue: 1.0,
        maintenance_eur_per_month: 3,
        license_eur_per_month: 0,
      },
    }
  );
}
