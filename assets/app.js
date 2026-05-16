const TIERS = [
  { id: "basic", name: "Rousix Basic Tablet", shortName: "Basic Tablet", price: 1250, detail: "Secure participation device" },
  { id: "standard", name: "Rousix Standard", shortName: "Standard", price: 4100, detail: "Sufficient baseline capacity" },
  { id: "standardPlus", name: "Rousix Standard Plus", shortName: "Standard Plus", price: 8250, detail: "Expanded baseline capacity" },
  { id: "premium", name: "Rousix Premium", shortName: "Premium", price: 12450, detail: "Higher-capacity participation path" },
  { id: "titan", name: "Rousix Titan", shortName: "Titan", price: 75000, detail: "Enterprise workstation path" },
  { id: "colossus", name: "Rousix Colossus", shortName: "Colossus", price: 150000, detail: "Cluster array system" },
  { id: "olympus", name: "Rousix Olympus", shortName: "Olympus", price: 300000, detail: "Data center in a box" }
];

const PLAN = {
  timelineMonths: 36,
  displayedSurplusMultiple: 5,

  // This follows the sample structure: a $1,000,000 goal uses about
  // $165,000 of total inputted amount, leaving about $835,000 on the
  // surplus side of the goal.
  targetInputPercent: 0.165,

  // This keeps the prior starting suggestion behavior:
  // $250,000 / 60 = about $4,167.
  startingPointDivisor: 60,

  // This matches the sample "more upfront" path:
  // $1,000,000 x 7.5% = $75,000 upfront.
  moreUpfrontPercent: 0.075
};

// Replace these placeholder URLs with hosted checkout links from Stripe Payment Links.
// Do not collect card numbers inside a GitHub Pages site.
const PAYMENT_LINKS = {
  deposit: "https://buy.stripe.com/REPLACE_WITH_1_DOLLAR_PLANNING_DEPOSIT_LINK",
  starter: "https://buy.stripe.com/REPLACE_WITH_5_DOLLAR_OR_CUSTOM_ONE_TIME_LINK",
  monthly: "https://buy.stripe.com/REPLACE_WITH_1_DOLLAR_MONTHLY_SUBSCRIPTION_LINK"
};

let currentPlan = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function dollars(value, rounding = "round") {
  const clean = Number.isFinite(value) ? value : 0;
  const adjusted = rounding === "floor" ? Math.floor(clean) : Math.round(clean);

  return adjusted.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function pct(value) {
  return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
}

function numberFrom(id, fallback = 0) {
  const element = $(id);
  if (!element) return fallback;

  const value = parseFloat(element.value);
  return Number.isFinite(value) ? value : fallback;
}

function wholeDollar(value) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function tierById(id) {
  return TIERS.find((tier) => tier.id === id) || TIERS[0];
}

function tierFromBudget(budget) {
  let suggested = TIERS[0];

  for (const tier of TIERS) {
    if (tier.price <= budget) suggested = tier;
  }

  return suggested;
}

function goalPhrase(goalType) {
  return goalType.toLowerCase();
}

function styleLabel(style, compact = false) {
  if (style === "moreUpfront") {
    return compact ? "More upfront" : "more money upfront and less monthly payments";
  }

  return compact ? "Less upfront" : "less money upfront and more monthly payments";
}

function totalInputTarget(targetPrice) {
  return Math.max(5, targetPrice * PLAN.targetInputPercent);
}

function realisticStartingPoint(targetPrice) {
  return Math.max(5, targetPrice / PLAN.startingPointDivisor);
}

function realisticMonthlyPoint(targetPrice, startingContribution) {
  const neededAfterStart = totalInputTarget(targetPrice) - startingContribution;
  return Math.max(1, neededAfterStart / PLAN.timelineMonths);
}

function balanceRecommendation(targetPrice, contributionStyle) {
  const requiredInputTotal = totalInputTarget(targetPrice);
  const premiumPrice = tierById("premium").price;

  // Less upfront: keep the person near the realistic starting point for smaller goals,
  // but cap that upfront amount at Premium for larger goals. This preserves the
  // requested $1,000,000 example: $12,450 upfront and about $4,237 monthly.
  const lessUpfrontStart = Math.min(realisticStartingPoint(targetPrice), premiumPrice);

  // More upfront: use the requested Titan-style example for large goals, scaling
  // by goal price. $1,000,000 x 7.5% = $75,000 upfront and $2,500 monthly.
  const moreUpfrontStart = targetPrice * PLAN.moreUpfrontPercent;

  const startingContribution = wholeDollar(
    contributionStyle === "moreUpfront" ? moreUpfrontStart : lessUpfrontStart
  );

  const monthlyContribution = Math.max(
    1,
    Math.floor((requiredInputTotal - startingContribution) / PLAN.timelineMonths)
  );

  const directContributionTotal = startingContribution + monthlyContribution * PLAN.timelineMonths;
  const inputGap = Math.max(0, requiredInputTotal - directContributionTotal);

  return {
    startingContribution,
    monthlyContribution,
    directContributionTotal,
    inputGap
  };
}

function applyBalanceRecommendation() {
  const targetPrice = Math.max(100, numberFrom("#targetPrice", 100));
  const contributionStyle = $("#contributionStyle").value;
  const recommendation = balanceRecommendation(targetPrice, contributionStyle);

  $("#startingContribution").value = String(recommendation.startingContribution);
  $("#monthlyContribution").value = String(recommendation.monthlyContribution);
}

function suggestTier({ targetPrice, startingContribution, contributionStyle, recommendedStart }) {
  const styleBudget = contributionStyle === "moreUpfront"
    ? Math.max(startingContribution, recommendedStart)
    : Math.max(startingContribution, recommendedStart * 0.9);

  let suggested = tierFromBudget(styleBudget);

  // If the selected balance is the exact Premium example or better, do not undersell
  // the discussion tier below Premium.
  if (contributionStyle === "lessUpfront" && recommendedStart >= tierById("premium").price) {
    suggested = tierFromBudget(Math.max(styleBudget, tierById("premium").price));
  }

  // Keep very small goals from jumping into oversized tiers unless the starting
  // contribution itself already supports that conversation.
  if (targetPrice < 50000 && startingContribution < 12450 && suggested.price > 8250) {
    suggested = tierById("standardPlus");
  }

  return suggested;
}

function buildPlan() {
  const goalType = $("#goalType").value;
  const personName = $("#personName").value.trim() || `Sample ${goalPhrase(goalType)} roadmap`;
  const targetPrice = Math.max(100, numberFrom("#targetPrice", 100));
  const startingContribution = Math.max(0, numberFrom("#startingContribution", 0));
  const monthlyContribution = Math.max(0, numberFrom("#monthlyContribution", 0));
  const contributionStyle = $("#contributionStyle").value;

  const requiredInputTotal = totalInputTarget(targetPrice);
  const directContributionTotal = startingContribution + monthlyContribution * PLAN.timelineMonths;
  const inputGap = Math.max(0, requiredInputTotal - directContributionTotal);
  const inputSurplus = Math.max(0, directContributionTotal - requiredInputTotal);
  const surplusSideOfGoal = Math.max(0, targetPrice - requiredInputTotal);
  const realisticStart = realisticStartingPoint(targetPrice);
  const monthlyNeededAfterStart = realisticMonthlyPoint(targetPrice, startingContribution);
  const recommendation = balanceRecommendation(targetPrice, contributionStyle);
  const coveragePercent = requiredInputTotal > 0 ? (directContributionTotal / requiredInputTotal) * 100 : 0;

  const selectedTier = suggestTier({
    targetPrice,
    startingContribution,
    contributionStyle,
    recommendedStart: recommendation.startingContribution
  });

  const warnings = [];

  if (startingContribution < 5) {
    warnings.push({ type: "danger", text: "The starting contribution should be at least $5." });
  }

  if (monthlyContribution < 1) {
    warnings.push({ type: "danger", text: "The monthly contribution should be at least $1." });
  }

  if (startingContribution < realisticStart && contributionStyle !== "lessUpfront") {
    warnings.push({
      type: "caution",
      text: `For this ${goalPhrase(goalType)} goal, a more realistic starting point is about ${dollars(realisticStart)}. The current start is below that, so this roadmap needs review.`
    });
  }

  if (monthlyContribution + 1 < monthlyNeededAfterStart) {
    warnings.push({
      type: "caution",
      text: `With the current starting contribution, a more realistic monthly point is about ${dollars(monthlyNeededAfterStart, "floor")} for this 36-month path.`
    });
  }

  if (startingContribution + 1 < recommendation.startingContribution || monthlyContribution + 1 < recommendation.monthlyContribution) {
    warnings.push({
      type: "caution",
      text: `The selected ${styleLabel(contributionStyle, true).toLowerCase()} balance is designed around about ${dollars(recommendation.startingContribution)} upfront and ${dollars(recommendation.monthlyContribution)} per month for this price.`
    });
  }

  if (startingContribution < selectedTier.price) {
    warnings.push({
      type: "caution",
      text: `${selectedTier.shortName} is only a suggested discussion point. The current starting contribution is below the ${dollars(selectedTier.price)} tier price, so this should be reviewed directly.`
    });
  }

  if (!$("#acknowledge").checked) {
    warnings.push({
      type: "danger",
      text: "The person should acknowledge the planning disclaimer before moving to a real next step."
    });
  }

  const hasDanger = warnings.some((warning) => warning.type === "danger");
  const nearCompleteTolerance = Math.max(50, requiredInputTotal * 0.0025);
  const isOnPath = inputGap <= nearCompleteTolerance && !hasDanger;

  const status = isOnPath
    ? "On sample path"
    : coveragePercent >= 85 && !hasDanger
      ? "Close, review details"
      : "Needs review";

  return {
    personName,
    goalType,
    targetPrice,
    startingContribution,
    monthlyContribution,
    contributionStyle,
    timelineMonths: PLAN.timelineMonths,
    displayedSurplusMultiple: PLAN.displayedSurplusMultiple,
    requiredInputTotal,
    directContributionTotal,
    inputGap,
    inputSurplus,
    surplusSideOfGoal,
    realisticStart,
    monthlyNeededAfterStart,
    recommendation,
    coveragePercent,
    selectedTier,
    warnings,
    status
  };
}

function plainSummary(plan) {
  const contributionSentence = `The current inputted amount over 36 months is ${dollars(plan.directContributionTotal)}: ${dollars(plan.startingContribution)} upfront plus ${dollars(plan.monthlyContribution)} per month for 36 months.`;

  const gapSentence = plan.inputGap > 50
    ? `That leaves about ${dollars(plan.inputGap)} in inputted amount to review against the ${dollars(plan.requiredInputTotal)} sample input target.`
    : `That places the plan on the sample input path for the ${dollars(plan.requiredInputTotal)} input target.`;

  const balanceSentence = `For this selected balance, the auto-filled recommendation is about ${dollars(plan.recommendation.startingContribution)} upfront and ${dollars(plan.recommendation.monthlyContribution)} per month.`;
  const surplusSentence = `In this simple 5x-style structure, the surplus side of the goal is about ${dollars(plan.surplusSideOfGoal)} for a ${dollars(plan.targetPrice)} ${goalPhrase(plan.goalType)}.`;

  return `${plan.personName}: The goal is to own or purchase a ${goalPhrase(plan.goalType)} priced around ${dollars(plan.targetPrice)} over a fixed 36-month timeline. The selected style is ${styleLabel(plan.contributionStyle)}. ${balanceSentence} ${contributionSentence} ${gapSentence} ${surplusSentence} ${plan.selectedTier.name} is shown as a suggested infrastructure discussion point, not as a user-selected preference. A simple next step is to review the starting amount, monthly amount, and disclaimer before anyone pays or signs anything.`;
}

function renderPlan(plan) {
  currentPlan = plan;
  const summary = plainSummary(plan);

  $("#previewTitle").textContent = plan.personName;
  $("#previewStyle").textContent = styleLabel(plan.contributionStyle, true);
  $("#previewStart").textContent = dollars(plan.startingContribution);
  $("#previewMonthly").textContent = dollars(plan.monthlyContribution);
  $("#previewBase").textContent = dollars(plan.requiredInputTotal);
  $("#previewTier").textContent = plan.selectedTier.shortName;
  $("#previewStatus").textContent = plan.status;
  $("#previewSummary").textContent = summary;
  $("#progressText").textContent = pct(plan.coveragePercent);
  $("#progressBar").style.width = pct(plan.coveragePercent);

  $("#emptyRoadmap").classList.add("hidden");
  $("#roadmapContent").classList.remove("hidden");

  $("#roadGoal").textContent = plan.goalType;
  $("#roadPrice").textContent = dollars(plan.targetPrice);
  $("#roadTimeline").textContent = `${plan.timelineMonths} months`;
  $("#roadStart").textContent = dollars(plan.startingContribution);
  $("#roadMonthly").textContent = dollars(plan.monthlyContribution);
  $("#roadTier").textContent = plan.selectedTier.shortName;
  $("#roadTitle").textContent = plan.personName;
  $("#roadSummary").textContent = summary;

  $("#roadInputs").textContent = `Goal: ${plan.goalType}. Price: ${dollars(plan.targetPrice)}. Contribution style: ${styleLabel(plan.contributionStyle)}. Starting contribution: ${dollars(plan.startingContribution)}. Monthly contribution: ${dollars(plan.monthlyContribution)}. Timeline: fixed at 36 months.`;

  $("#roadGapExplanation").textContent = `The sample input target is ${dollars(plan.requiredInputTotal)} over 36 months. The selected balance recommendation is ${dollars(plan.recommendation.startingContribution)} upfront and ${dollars(plan.recommendation.monthlyContribution)} monthly. The current path totals ${dollars(plan.directContributionTotal)}. The remaining input gap is ${plan.inputGap > 50 ? dollars(plan.inputGap) : "$0"}.`;

  $("#roadTierExplanation").textContent = `${plan.selectedTier.name} is suggested for discussion because the planner looks at the goal price, the starting contribution, and whether the person prefers more upfront or more monthly. ${plan.selectedTier.detail}.`;

  const warningBox = $("#roadWarnings");
  warningBox.innerHTML = "";

  plan.warnings.forEach((warning) => {
    const item = document.createElement("p");
    item.className = warning.type === "danger" ? "danger" : "";
    item.textContent = warning.text;
    warningBox.appendChild(item);
  });

  $("#tierMath").innerHTML = `
    <div><span>Framework</span><strong>36 months / about ${plan.displayedSurplusMultiple}x</strong></div>
    <div><span>36-month input target</span><strong>${dollars(plan.requiredInputTotal)}</strong></div>
    <div><span>Selected balance</span><strong>${styleLabel(plan.contributionStyle, true)}</strong></div>
    <div><span>Recommended start</span><strong>${dollars(plan.recommendation.startingContribution)}</strong></div>
    <div><span>Recommended monthly</span><strong>${dollars(plan.recommendation.monthlyContribution)}</strong></div>
    <div><span>Surplus side of goal</span><strong>${dollars(plan.surplusSideOfGoal)}</strong></div>
    <div><span>Current inputted amount</span><strong>${dollars(plan.directContributionTotal)}</strong></div>
    <div><span>Remaining input gap</span><strong>${plan.inputGap > 50 ? dollars(plan.inputGap) : "$0"}</strong></div>
    <div><span>Suggested infrastructure</span><strong>${plan.selectedTier.shortName}</strong></div>
  `;
}

function updateHints() {
  const targetPrice = Math.max(100, numberFrom("#targetPrice", 100));
  const goalType = $("#goalType").value;
  const startingContribution = Math.max(0, numberFrom("#startingContribution", 0));
  const contributionStyle = $("#contributionStyle").value;
  const recMonthly = realisticMonthlyPoint(targetPrice, startingContribution);
  const balance = balanceRecommendation(targetPrice, contributionStyle);
  const goal = goalPhrase(goalType);

  $("#balanceHint").textContent = `Changing this selection automatically updates the starting and monthly fields. For the current ${dollars(targetPrice)} ${goal}, ${styleLabel(contributionStyle)} recommends about ${dollars(balance.startingContribution)} upfront and ${dollars(balance.monthlyContribution)} per month.`;

  $("#startHint").textContent = `Minimum starts at $5. Based on a ${dollars(targetPrice)} ${goal} and the selected contribution balance, a more realistic starting point is about ${dollars(balance.startingContribution)}.`;

  if (recMonthly <= 1) {
    $("#monthlyHint").textContent = `Minimum recurring amount is $1. With the current starting contribution, the sample path is already at or above the 36-month input target. The selected balance currently recommends ${dollars(balance.monthlyContribution)} per month.`;
    return;
  }

  $("#monthlyHint").textContent = `Minimum recurring amount is $1. With the current starting contribution, a more realistic monthly point is about ${dollars(recMonthly, "floor")}. The selected balance currently recommends ${dollars(balance.monthlyContribution)} per month.`;
}

function copyCurrentSummary(button) {
  if (!currentPlan) renderPlan(buildPlan());

  const text = plainSummary(currentPlan);
  const activeButton = button || $("#copySummary");

  if (!navigator.clipboard) {
    window.prompt("Copy this summary:", text);
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    const original = activeButton.textContent;
    activeButton.textContent = "Copied";

    setTimeout(() => {
      activeButton.textContent = original;
    }, 1200);
  });
}

function openPayment(type) {
  const link = PAYMENT_LINKS[type];

  if (!link || link.includes("REPLACE_WITH")) {
    alert("This button will be activated in a future release.");
    return;
  }

  window.open(link, "_blank", "noopener,noreferrer");
}

function setRoute() {
  const route = (window.location.hash || "#home").replace("#", "");
  const knownRoute = $$(".view").some((view) => view.dataset.route === route) ? route : "home";

  $$(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.route === knownRoute);
  });

  $$(".nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${knownRoute}`);
  });

  document.body.classList.remove("menu-open");
  $(".nav-toggle").setAttribute("aria-expanded", "false");

  if (knownRoute === "roadmap" && !currentPlan) {
    $("#emptyRoadmap").classList.remove("hidden");
    $("#roadmapContent").classList.add("hidden");
  }
}

function refreshPlan(options = {}) {
  if (options.applyBalance) applyBalanceRecommendation();
  updateHints();
  renderPlan(buildPlan());
}

function init() {
  setRoute();
  refreshPlan({ applyBalance: true });

  window.addEventListener("hashchange", setRoute);

  $(".nav-toggle").addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("menu-open");
    $(".nav-toggle").setAttribute("aria-expanded", String(isOpen));
  });

  $("#plannerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    refreshPlan();
    window.location.hash = "roadmap";
  });

  $("#plannerForm").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("input, select")) {
      event.preventDefault();
      const shouldApplyBalance = event.target.matches("#targetPrice, #contributionStyle");
      refreshPlan({ applyBalance: shouldApplyBalance });
    }
  });

  ["#personName", "#goalType", "#startingContribution", "#monthlyContribution", "#acknowledge"].forEach((selector) => {
    const element = $(selector);
    if (!element) return;

    element.addEventListener("input", () => refreshPlan());
    element.addEventListener("change", () => refreshPlan());
  });

  $("#contributionStyle").addEventListener("change", () => refreshPlan({ applyBalance: true }));
  $("#targetPrice").addEventListener("change", () => refreshPlan({ applyBalance: true }));
  $("#targetPrice").addEventListener("input", () => refreshPlan());

  $("#copySummary").addEventListener("click", (event) => copyCurrentSummary(event.currentTarget));
  $("#copyRoadmap").addEventListener("click", (event) => copyCurrentSummary(event.currentTarget));
  $("#printRoadmap").addEventListener("click", () => window.print());

  $$('[data-pay]').forEach((button) => {
    button.addEventListener("click", () => openPayment(button.dataset.pay));
  });
}

document.addEventListener("DOMContentLoaded", init);
