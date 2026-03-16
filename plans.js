/* ================================================================
   IMPACTGRID PLAN SYSTEM v5.1 — plans.js

   Architecture:
   - sessions    : one full analysis run per 30-day period
   - aiQuestions : total AI chat messages per month — soft stop after limit
   - forecasts   : forecast generations per month
   - pdfs        : PDF exports per month
   - dataDays    : days of records retained (Basic=30, Pro=365, Enterprise=∞)
   
   Sessions reset every 30 days from first use. Logout/login NEVER
   resets sessions — they are always read live from Supabase.
================================================================ */

const IMPACTGRID_ADMIN_ID = "303580e9-38c8-450b-90e0-82045e0b5c27";

const STRIPE_LINKS = {
  professional: "https://buy.stripe.com/aFa5kwaAg6Pedn64zC8N201",
  enterprise:   "https://buy.stripe.com/8x29AM23Ka1qbeY5DG8N200"
};

/* ================================================================
   PLAN DEFINITIONS
================================================================ */
const PLAN_CONFIG = {

  basic: {
    label:         "Basic",
    price:         "Free",
    color:         "#a0b0cc",
    sessions:      3,
    aiQuestions:   10,
    forecasts:     3,
    pdfs:          0,
    reportHistory: 3,
    forecastYears: 1,
    fileImport:    false,
    matrix:        false,
    benchmarking:  false,
    excelExport:   false,
    priorityAI:    false,
    multiProfile:  false,
    dataDays:      30,
    dataWarnDays:  5,
    trialDays:     0
  },

  professional: {
    label:         "Professional",
    price:         "£8.99/mo",
    color:         "#e2c98a",
    sessions:      10,
    aiQuestions:   Infinity,
    forecasts:     10,
    pdfs:          10,
    reportHistory: 10,
    forecastYears: 3,
    fileImport:    true,
    matrix:        true,
    benchmarking:  false,
    excelExport:   false,
    priorityAI:    false,
    multiProfile:  false,
    dataDays:      365,
    dataWarnDays:  0,
    trialDays:     30
  },

  enterprise: {
    label:         "Enterprise",
    price:         "£13.99/mo",
    color:         "#7eb3ff",
    sessions:      Infinity,
    aiQuestions:   Infinity,
    forecasts:     Infinity,
    pdfs:          Infinity,
    reportHistory: Infinity,
    forecastYears: 10,
    fileImport:    true,
    matrix:        true,
    benchmarking:  true,
    excelExport:   true,
    priorityAI:    true,
    multiProfile:  true,
    dataDays:      Infinity,
    dataWarnDays:  0,
    trialDays:     30
  },

  admin: {
    label:         "Admin",
    price:         "Internal",
    color:         "#2dd4a0",
    sessions:      Infinity,
    aiQuestions:   Infinity,
    forecasts:     Infinity,
    pdfs:          Infinity,
    reportHistory: Infinity,
    forecastYears: 10,
    fileImport:    true,
    matrix:        true,
    benchmarking:  true,
    excelExport:   true,
    priorityAI:    true,
    multiProfile:  true,
    dataDays:      Infinity,
    dataWarnDays:  0,
    trialDays:     0
  }
};

/* ── Global runtime state ── */
window.currentPlan      = "basic";
window.currentUser      = null;
window.isAdmin          = false;
window.planConfig       = PLAN_CONFIG;
window.aiMemoryContext  = "";
window.usageThisMonth   = { sessions: 0, aiQuestions: 0, forecasts: 0, pdfs: 0 };
window.usagePeriodStart = null;

/* Session lifecycle flags — in-memory only, just for current page load */
window.__igSessionOpen     = false;
window.__igSessionConsumed = false;

/* ================================================================
   MAIN INIT
================================================================ */
async function initPlanSystem() {
  /* Synchronous guard — set BEFORE any await so double-calls are blocked immediately */
  if (window.__igPlanInitDone) { console.log("[ImpactGrid] initPlanSystem already ran — skipping"); return; }
  window.__igPlanInitDone = true;
  try {
    const supabase = await window.supabaseReady;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    window.currentUser = session.user;

    if (session.user.id === IMPACTGRID_ADMIN_ID) {
      window.currentPlan = "admin";
      window.isAdmin     = true;
      applyPlanUI();
      await loadUserData();
      await buildAIMemoryContext();
      renderReportHistory();
      return;
    }

    let { data: planRow, error: planErr } = await supabase
      .from("user_plans").select("*").eq("user_id", session.user.id).maybeSingle();

    if (planErr && planErr.code !== "PGRST116") {
      console.error("[ImpactGrid] user_plans fetch error:", planErr.message);
    }

    if (!planRow) {
      console.log("[ImpactGrid] No plan row found — creating new one");
      planRow = await createUserPlanRow(session.user.id, supabase);
    } else {
      console.log("[ImpactGrid] Plan loaded:", planRow.plan, "| sessions_used:", planRow.sessions_used, "| period_start:", planRow.usage_period_start);
    }

    /* Map "analyst" rows (old name) to "basic" */
    window.currentPlan = (planRow.plan === "analyst" ? "basic" : planRow.plan) || "basic";

    window.usagePeriodStart = planRow.usage_period_start
      ? new Date(planRow.usage_period_start) : new Date();

    const now       = new Date();
    const periodEnd = new Date(window.usagePeriodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

    if (now > periodEnd) {
      /* 30-day period expired — reset counters in DB and memory */
      window.usageThisMonth   = { sessions: 0, aiQuestions: 0, forecasts: 0, pdfs: 0 };
      window.usagePeriodStart = now;
      await supabase.from("user_plans").update({
        sessions_used: 0, ai_questions_used: 0,
        forecasts_used: 0, pdfs_used: 0,
        usage_period_start: now.toISOString()
      }).eq("user_id", session.user.id);
    } else {
      /* Load real counts from DB — this is what shows on login */
      window.usageThisMonth = {
        sessions:    planRow.sessions_used     || 0,
        aiQuestions: planRow.ai_questions_used || 0,
        forecasts:   planRow.forecasts_used    || 0,
        pdfs:        planRow.pdfs_used         || 0
      };
    }

    /* Reset per-page-load session flags */
    window.__igSessionOpen     = false;
    window.__igSessionConsumed = false;

    applyPlanUI();
    showTrialBannerIfNeeded(planRow);
    await loadUserData();
    await buildAIMemoryContext();
    renderReportHistory();
    checkDataExpiry();
    /* Final usage bar refresh after everything is loaded */
    updateUsageBar();

  } catch(e) { console.error("Plan init error:", e); }
}

/* ================================================================
   CREATE USER PLAN ROW
================================================================ */
async function createUserPlanRow(userId, supabase) {
  const sb  = supabase || window.supabaseClient;
  const now = new Date().toISOString();
  const fallback = {
    user_id: userId, plan: "basic",
    sessions_used: 0, ai_questions_used: 0, forecasts_used: 0, pdfs_used: 0,
    usage_period_start: now, created_at: now
  };

  /* Step 1: try to insert. If row already exists this will error — that's fine */
  const { error: insertErr } = await sb.from("user_plans").insert(fallback);
  if (insertErr && !insertErr.message.includes("duplicate")) {
    console.error("[ImpactGrid] plan insert error:", insertErr.message);
  }

  /* Step 2: always fetch the row — whether we just created it or it already existed */
  const { data: fetched, error: fetchErr } = await sb.from("user_plans")
    .select("*").eq("user_id", userId).maybeSingle();

  if (fetchErr) console.error("[ImpactGrid] plan fetch error:", fetchErr.message);

  if (fetched) {
    console.log("[ImpactGrid] Plan row ready:", fetched.plan, "| sessions:", fetched.sessions_used);
    return fetched;
  }

  return fallback;
}

/* ================================================================
   USAGE HELPERS
================================================================ */
function getLimit(type) {
  const config = PLAN_CONFIG[window.currentPlan];
  return config ? config[type] : 0;
}
function getUsed(type) { return window.usageThisMonth[type] || 0; }
function getDaysUntilReset() {
  if (!window.usagePeriodStart) return 30;
  const end = new Date(window.usagePeriodStart);
  end.setDate(end.getDate() + 30);
  return Math.max(0, Math.ceil((end - new Date()) / 86400000));
}

async function canUse(type) {
  if (window.isAdmin) return true;
  const limit = getLimit(type);
  if (limit === Infinity) return true;
  if (limit === 0) return false;
  return getUsed(type) < limit;
}

async function incrementUsage(type) {
  if (window.isAdmin) return;
  const limit = getLimit(type);
  if (limit === Infinity) return;
  window.usageThisMonth[type] = (window.usageThisMonth[type] || 0) + 1;
  const colMap = {
    sessions: "sessions_used", aiQuestions: "ai_questions_used",
    forecasts: "forecasts_used", pdfs: "pdfs_used"
  };
  const col = colMap[type];
  if (!col || !window.currentUser) return;
  const update = {};
  update[col] = window.usageThisMonth[type];
  const { error: usageErr } = await window.supabaseClient.from("user_plans")
    .update(update).eq("user_id", window.currentUser.id);
  if (usageErr) console.error("[ImpactGrid] incrementUsage save error:", usageErr.message);
  else console.log("[ImpactGrid] Usage saved:", type, "=", window.usageThisMonth[type]);
  updateUsageBar();
}

/* ================================================================
   SESSION LIFECYCLE
   Basic plan only. Professional/Enterprise: sessions = Infinity.

   igSessionStart() — called when user clicks "+ Add Record"
     Reads LIVE count from Supabase every time — logout/login safe.
     Returns false + shows modal if all 3 sessions used this month.

   igSessionClose() — called when user opens Charts/AI/Report/Risk.
     Increments sessions_used in DB. __igSessionConsumed prevents
     double-counting within the same page load only.
================================================================ */
async function igSessionStart() {
  if (window.isAdmin) return true;
  if (window.currentPlan !== "basic") return true;

  /* Always read live from Supabase — never trust in-memory for gate checks */
  try {
    const { data: planRow } = await window.supabaseClient
      .from("user_plans")
      .select("sessions_used, usage_period_start")
      .eq("user_id", window.currentUser.id)
      .maybeSingle();   /* maybeSingle returns null (not 406) if no row exists */

    if (planRow) {
      const periodStart = new Date(planRow.usage_period_start || Date.now());
      const periodEnd   = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 30);

      if (new Date() > periodEnd) {
        /* Period expired — reset */
        window.usageThisMonth.sessions = 0;
        window.usagePeriodStart = new Date();
        await window.supabaseClient.from("user_plans").update({
          sessions_used: 0, ai_questions_used: 0, forecasts_used: 0, pdfs_used: 0,
          usage_period_start: new Date().toISOString()
        }).eq("user_id", window.currentUser.id);
      } else {
        /* Sync real count into memory */
        window.usageThisMonth.sessions = planRow.sessions_used || 0;
        updateUsageBar();
      }
    }
  } catch(e) { /* non-fatal — fall through to in-memory value */ }

  const limit = getLimit("sessions");
  const used  = getUsed("sessions");

  if (used >= limit) {
    _showSessionLimitModal(used, limit);
    return false;
  }

  window.__igSessionOpen     = true;
  window.__igSessionConsumed = false;
  return true;
}

async function igSessionClose() {
  if (window.isAdmin) return;
  if (window.currentPlan !== "basic") return;
  if (!window.__igSessionOpen || window.__igSessionConsumed) return;
  window.__igSessionOpen     = false;
  window.__igSessionConsumed = true;
  await incrementUsage("sessions");
  updateUsageBar();
}

function _showSessionLimitModal(used, limit) {
  const days  = getDaysUntilReset();
  const modal = document.getElementById("limitModal");
  if (!modal) return;
  document.getElementById("limitModalTitle").textContent = "Session Limit Reached";
  document.getElementById("limitModalBody").innerHTML =
    "You've used all <strong style='color:var(--gold)'>" + limit + " free analysis sessions</strong> for this month.<br><br>" +
    "A session covers adding data and viewing your full analysis dashboard. " +
    "Upgrade to <strong>Professional</strong> for 10 sessions/month, or " +
    "<strong>Enterprise</strong> for unlimited.<br><br>" +
    "<span style='color:var(--success);font-size:13px;'>⟳ Free sessions reset in <strong>" +
    days + " day" + (days !== 1 ? "s" : "") + "</strong></span>";
  document.getElementById("limitUpgradeBtn").style.display = "block";
  document.getElementById("limitUpgradeBtn").href = STRIPE_LINKS.professional;
  document.getElementById("limitUpgradeBtn").textContent = "Upgrade to Professional — £8.99/mo";
  modal.style.display = "flex";
}

/* ================================================================
   AI QUESTION GATING — soft stop at 10 (Basic plan)
================================================================ */
async function checkAIQuestion() {
  if (window.isAdmin) return { allowed: true, softStop: false };
  const limit = getLimit("aiQuestions");
  if (limit === Infinity) return { allowed: true, softStop: false };
  await incrementUsage("aiQuestions");
  const nowUsed = getUsed("aiQuestions");
  const softStop = nowUsed > limit;
  return { allowed: true, softStop };
}

function aiUpgradeNudge() {
  const days = getDaysUntilReset();
  return '<div style="margin-top:14px;padding:12px 16px;background:linear-gradient(135deg,rgba(176,125,46,0.08),rgba(212,160,67,0.04));border:1px solid rgba(176,125,46,0.22);border-radius:10px;font-size:12px;font-family:\'DM Sans\',sans-serif;color:var(--text-secondary);">' +
    '<strong style="color:var(--gold);display:block;margin-bottom:5px;">⚡ You\'ve reached your 10 free AI questions this month</strong>' +
    'Upgrade to <a href="' + STRIPE_LINKS.professional + '" target="_blank" style="color:var(--gold);text-decoration:underline;">Professional</a> ' +
    'for unlimited AI questions plus 10 sessions, forecasts, and PDF exports per month.' +
    '<span style="display:block;margin-top:6px;font-size:11px;color:var(--text-muted);">⟳ Resets in ' +
    days + ' day' + (days !== 1 ? 's' : '') + '</span></div>';
}

/* ================================================================
   FORECAST GATING
================================================================ */
async function checkForecast() {
  if (window.isAdmin) return true;
  const allowed = await canUse("forecasts");
  if (!allowed) { showLimitModal("forecasts"); return false; }
  await incrementUsage("forecasts");
  return true;
}

/* ================================================================
   DATA EXPIRY — Basic plan (7-day retention)
   Day 25: yellow warning (5 days before expiry)
   Day 30: red expiry notice, data hidden
   Day 37: hard delete from Supabase (7-day grace period)
================================================================ */
async function checkDataExpiry() {
  if (window.isAdmin) return;
  if (window.currentPlan !== "basic") return;
  if (!window.businessData || !window.businessData.length) return;

  const retainDays = PLAN_CONFIG.basic.dataDays || 7;
  const warnDays   = PLAN_CONFIG.basic.dataWarnDays || 2;
  const graceDays  = 7;

  /* Use savedAt (when record was entered) NOT d.date (reporting month).
     Dec 2025 data entered today has savedAt=today — not 90 days old. */
  const savedAts = window.businessData.map(function(d) {
    return d.savedAt ? new Date(d.savedAt) : new Date();  /* default now = never expires */
  });
  const oldest  = new Date(Math.min.apply(null, savedAts));
  const ageDays = Math.floor((Date.now() - oldest.getTime()) / 86400000);
  const daysLeft = retainDays - ageDays;

  if (daysLeft <= 0) {
    _showDataExpiryNotice(true, 0);
    if (ageDays > retainDays + graceDays) await _hardDeleteExpiredData();
  } else if (daysLeft <= warnDays) {
    _showDataExpiryNotice(false, daysLeft);
  }
}

function _showDataExpiryNotice(expired, daysLeft) {
  if (document.getElementById("dataExpiryBanner")) return;
  const header = document.querySelector(".dashboard-header");
  if (!header) return;
  const banner = document.createElement("div");
  banner.id = "dataExpiryBanner";
  if (expired) {
    banner.style.cssText = "display:flex;align-items:flex-start;gap:12px;margin-top:14px;padding:14px 18px;background:linear-gradient(135deg,rgba(255,77,109,0.08),rgba(255,77,109,0.04));border:1px solid rgba(255,77,109,0.28);border-radius:12px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text-secondary);";
    banner.innerHTML = "<span style='font-size:20px;flex-shrink:0;'>🗑️</span><div>" +
      "<strong style='color:#ff4d6d;display:block;margin-bottom:4px;'>Your data has expired</strong>" +
      "Your free plan stores data for 7 days. Your records are hidden and will be permanently deleted in 7 days unless you upgrade." +
      "<div style='margin-top:10px;'><a href='" + STRIPE_LINKS.professional + "' target='_blank' style='padding:7px 16px;background:linear-gradient(135deg,#8a6020,#d4a043);color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700;'>Upgrade to recover data</a></div></div>";
  } else {
    banner.style.cssText = "display:flex;align-items:flex-start;gap:12px;margin-top:14px;padding:14px 18px;background:linear-gradient(135deg,rgba(200,169,110,0.08),rgba(200,169,110,0.03));border:1px solid rgba(200,169,110,0.25);border-radius:12px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text-secondary);";
    banner.innerHTML = "<span style='font-size:20px;flex-shrink:0;'>⚠️</span><div>" +
      "<strong style='color:var(--gold);display:block;margin-bottom:4px;'>Your data expires in " + daysLeft + " day" + (daysLeft !== 1 ? "s" : "") + "</strong>" +
      "The free Basic plan stores data for 7 days. Upgrade before expiry to keep all records and history." +
      "<div style='margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;'>" +
      "<a href='" + STRIPE_LINKS.professional + "' target='_blank' style='padding:7px 16px;background:linear-gradient(135deg,#8a6020,#d4a043);color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700;'>Upgrade — £8.99/mo</a>" +
      "<button onclick=\"document.getElementById('dataExpiryBanner').style.display='none'\" style='padding:7px 14px;background:transparent;border:1px solid rgba(200,169,110,0.25);color:var(--text-muted);border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;'>Dismiss</button>" +
      "</div></div>";
  }
  header.appendChild(banner);
}

async function _hardDeleteExpiredData() {
  if (!window.currentUser) return;
  try {
    window.businessData.length = 0; /* mutate, never replace */
    await window.supabaseClient.from("user_data").upsert({
      user_id: window.currentUser.id, data: "[]", updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (typeof updateAll === "function") updateAll();
    if (typeof renderRecordsPanel === "function") renderRecordsPanel();
  } catch(e) { console.error("Hard delete error:", e); }
}

/* ================================================================
   LIMIT MODAL (generic)
================================================================ */
function showLimitModal(type) {
  const days  = getDaysUntilReset();
  const limit = getLimit(type);
  const used  = getUsed(type);
  const plan  = PLAN_CONFIG[window.currentPlan];
  const labels = { sessions:"analysis sessions", aiQuestions:"AI questions", forecasts:"forecasts", pdfs:"PDF exports" };
  const modal = document.getElementById("limitModal");
  if (!modal) return;
  const isNoPDF = (type === "pdfs" && limit === 0);
  document.getElementById("limitModalTitle").textContent = isNoPDF ? "PDF Export Unavailable" : "Monthly Limit Reached";
  document.getElementById("limitModalBody").innerHTML = isNoPDF
    ? "PDF report export is not available on the <strong>" + plan.label + "</strong> plan.<br><br>Upgrade to <strong>Professional</strong> for 10 PDF exports per month."
    : "You've used <strong style='color:var(--gold)'>" + used + " of " + limit + " " + (labels[type]||type) + "</strong> this month.<br><br>" +
      "<span style='color:var(--success);font-size:13px;'>⟳ Resets in <strong>" + days + " day" + (days !== 1 ? "s" : "") + "</strong></span>";
  document.getElementById("limitUpgradeBtn").style.display = (window.currentPlan === "enterprise") ? "none" : "block";
  document.getElementById("limitUpgradeBtn").href = (window.currentPlan === "basic") ? STRIPE_LINKS.professional : STRIPE_LINKS.enterprise;
  document.getElementById("limitUpgradeBtn").textContent = (window.currentPlan === "basic") ? "Upgrade to Professional — £8.99/mo" : "Upgrade to Enterprise — £13.99/mo";
  modal.style.display = "flex";
}

function closeLimitModal() {
  const modal = document.getElementById("limitModal");
  if (modal) modal.style.display = "none";
}

/* ================================================================
   USAGE BAR
================================================================ */
function updateUsageBar() {
  const bar = document.getElementById("usageBar");
  if (!bar || window.isAdmin) return;
  const plan   = PLAN_CONFIG[window.currentPlan];
  if (!plan) return;
  const types  = ["sessions","aiQuestions","forecasts","pdfs"];
  const labels = ["Sessions","AI Qs","Forecasts","PDFs"];
  bar.innerHTML = types.map(function(t, i) {
    var limit = plan[t];
    if (limit === Infinity || limit === 0) return "";
    var used  = getUsed(t);
    var pct   = Math.min(100, Math.round((used / limit) * 100));
    var color = pct >= 100 ? "#ff4d6d" : pct >= 75 ? "#c8a96e" : "#2dd4a0";
    return '<div style="margin-bottom:8px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
      '<span style="font-size:9px;font-family:\'JetBrains Mono\',monospace;color:var(--text-muted);letter-spacing:0.08em;">' + labels[i].toUpperCase() + '</span>' +
      '<span style="font-size:9px;font-family:\'JetBrains Mono\',monospace;color:' + color + ';">' + used + '/' + limit + '</span></div>' +
      '<div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;">' +
      '<div style="height:3px;width:' + pct + '%;background:' + color + ';border-radius:2px;transition:width 0.4s;"></div></div></div>';
  }).join("") +
  '<div style="font-size:9px;font-family:\'JetBrains Mono\',monospace;color:var(--text-muted);margin-top:6px;text-align:center;">Resets in ' + getDaysUntilReset() + ' days</div>';
}

/* ================================================================
   TRIAL BANNER
================================================================ */
function showTrialBannerIfNeeded(planRow) {
  const banner = document.getElementById("trialBanner");
  if (!banner || window.isAdmin) return;
  const createdAt = new Date(planRow.created_at || Date.now());
  const trialEnd  = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + 30);
  const daysLeft  = Math.ceil((trialEnd - new Date()) / 86400000);
  if (daysLeft <= 0 || daysLeft > 30) return;
  const daysEl = document.getElementById("trialDaysLeft");
  if (daysEl) daysEl.textContent = daysLeft;
  const pct = Math.round((daysLeft / 30) * 100);
  const bar = document.getElementById("trialProgressBar");
  if (bar) bar.style.width = pct + "%";
  if (daysLeft <= 7) {
    banner.classList.add("tb-urgent");
    const titleEl = banner.querySelector(".tb-title");
    if (titleEl) titleEl.innerHTML = '<span class="tb-pulse"></span>Trial Ends in ' + daysLeft + ' Day' + (daysLeft !== 1 ? 's' : '') + ' — Upgrade to Keep Access';
    const subEl = banner.querySelector(".tb-sub");
    if (subEl) subEl.innerHTML = 'Your trial expires soon. Upgrade now to <strong>keep all your data and analysis history</strong> without interruption.';
    if (!document.getElementById("trialUpgradeBtn")) {
      const cta = document.createElement("a");
      cta.id = "trialUpgradeBtn";
      cta.href = STRIPE_LINKS.professional;
      cta.target = "_blank";
      cta.style.cssText = "flex-shrink:0;padding:10px 20px;background:linear-gradient(135deg,#8a6020,#d4a043);color:#fff;border-radius:10px;text-decoration:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 4px 16px rgba(176,125,46,0.3);";
      cta.textContent = "Upgrade Now →";
      banner.querySelector(".tb-inner").appendChild(cta);
    }
  }
  banner.style.display = "block";
}

/* ================================================================
   APPLY PLAN UI
================================================================ */
function applyPlanUI() {
  const config = PLAN_CONFIG[window.currentPlan];
  if (!config) return;

  const badge = document.getElementById("planBadge");
  if (badge) { badge.textContent = config.label; badge.className = "plan-badge plan-" + window.currentPlan; }

  const emailEl = document.getElementById("sidebarUserEmail");
  if (emailEl && window.currentUser) emailEl.textContent = window.currentUser.email;

  const avatarEl = document.getElementById("sidebarAvatar");
  if (avatarEl && window.currentUser && window.currentUser.email)
    avatarEl.textContent = window.currentUser.email[0].toUpperCase();

  const importSection = document.getElementById("fileImportSection");
  if (importSection) importSection.style.display = config.fileImport ? "block" : "none";

  document.querySelectorAll("[data-section='matrix']").forEach(function(el) {
    if (!config.matrix) { el.style.opacity = "0.4"; el.title = "Available on Professional plan"; }
  });

  const pdfBtn = document.getElementById("pdfExportBtn");
  if (pdfBtn) pdfBtn.onclick = function() { handlePDFClick(); };

  /* Update pricing card CTAs */
  var cardMap = { basic:"pricingBasic", professional:"pricingProfessional", enterprise:"pricingEnterprise" };
  Object.keys(cardMap).forEach(function(p) {
    var card = document.getElementById(cardMap[p]);
    var btn  = card ? card.querySelector(".plan-cta") : null;
    if (!btn) return;
    if (p === window.currentPlan) {
      btn.textContent = "✓ Current Plan";
      btn.disabled    = true;
      btn.style.opacity = "0.6";
      btn.style.cursor  = "not-allowed";
      if (btn.tagName === "A") { btn.removeAttribute("href"); btn.onclick = function(e) { e.preventDefault(); }; }
    }
  });

  updateUsageBar();
}

/* ================================================================
   SAVE / LOAD USER DATA
================================================================ */
async function saveUserData() {
  if (!window.currentUser) { console.warn("saveUserData: no user"); return; }
  try {
    /* Stamp each record with savedAt = now if not already set.
       savedAt tracks WHEN the record was entered (not the reporting month).
       We NEVER trim on save — records-panel.js handles the UI warning.
       Hard expiry only happens after dataDays + 7 grace days via checkDataExpiry(). */
    const now_ts = new Date().toISOString();
    let dataToSave = (window.businessData || []).map(function(d) {
      return {
        date:     d.date,
        revenue:  d.revenue,
        expenses: d.expenses,
        profit:   d.profit,
        savedAt:  d.savedAt || now_ts
      };
    });
    /* Backfill savedAt on existing records in-place — never replace the array */
    window.businessData.forEach(function(d, i) {
      if (!d.savedAt && dataToSave[i]) d.savedAt = dataToSave[i].savedAt;
    });

    const payload = {
      user_id:        window.currentUser.id,
      data:           JSON.stringify(dataToSave),
      currency:       window.currentCurrency || "GBP",
      business_type:  (document.getElementById("businessType")      || {}).value || "other",
      start_date:     (document.getElementById("businessStartDate") || {}).value || "",
      reporting_date: (document.getElementById("reportingDate")     || {}).value || "",
      updated_at:     new Date().toISOString()
    };
    const { error } = await window.supabaseClient.from("user_data").upsert(payload, { onConflict: "user_id" });
    if (error) console.error("[ImpactGrid] Save error:", error.message);
    else { console.log("[ImpactGrid] user_data saved — records:", (window.businessData||[]).length); showSaveBadge(); }
  } catch(e) { console.error("Save exception:", e); }
}

async function loadUserData() {
  if (!window.currentUser) return;
  try {
    console.log("[ImpactGrid] loadUserData: fetching for", window.currentUser.id);
    const { data, error } = await window.supabaseClient.from("user_data")
      .select("*").eq("user_id", window.currentUser.id).maybeSingle();
    if (error) { console.error("[ImpactGrid] Load error:", error.message); return; }
    if (!data) { console.warn("[ImpactGrid] loadUserData: no row in user_data for this user"); return; }
    console.log("[ImpactGrid] loadUserData: found row, data length=", (data.data||'').length, "currency=", data.currency);

    /* Restore profile fields regardless of whether there is financial data */
    if (data.currency) {
      window.currentCurrency = data.currency;
      const sel = document.getElementById("currencySelector");
      if (sel) sel.value = data.currency;
    }
    if (data.business_type) { const bt = document.getElementById("businessType"); if (bt) bt.value = data.business_type; }
    if (data.start_date)    { const sd = document.getElementById("businessStartDate"); if (sd) sd.value = data.start_date; }
    if (data.reporting_date){ const rd = document.getElementById("reportingDate"); if (rd) rd.value = data.reporting_date; }

    /* Restore financial records */
    if (data.data) {
      const parsed = JSON.parse(data.data);
      if (parsed && parsed.length) {
        let loaded = parsed.map(function(d) {
          return {
            date:     new Date(d.date),
            revenue:  Number(d.revenue),
            expenses: Number(d.expenses),
            profit:   Number(d.profit),
            savedAt:  d.savedAt || new Date().toISOString()  /* backfill if missing */
          };
        });

        /* CRITICAL: mutate the existing array — NEVER replace it with assignment.
           script.js does: var businessData = window.businessData
           That's a reference to the original array object.
           If we do window.businessData = loaded, script.js still holds the OLD empty array.
           We must clear and repopulate the same array object in memory. */
        window.businessData.length = 0;
        loaded.forEach(function(d) { window.businessData.push(d); });

        console.log("[ImpactGrid] loadUserData: loaded", loaded.length, "records into businessData");
        console.log("[ImpactGrid] businessData array id check:", window.businessData === (typeof businessData !== 'undefined' ? businessData : window.businessData));
      }
    }

    /* All data is now in window.businessData — refresh UI now and retry */
    function _refreshUI() {
      var n = (window.businessData || []).length;
      console.log("[ImpactGrid] _refreshUI: businessData has", n, "records");
      if (typeof updateAll          === "function") updateAll();
      if (typeof renderRecordsPanel === "function") renderRecordsPanel();
      document.dispatchEvent(new CustomEvent("igDataLoaded", { detail: { records: n } }));
    }
    _refreshUI();
    setTimeout(_refreshUI, 400);
    setTimeout(_refreshUI, 1000);

    showAIMemoryGreeting();
  } catch(e) { console.error("Load exception:", e); }
}

/* ================================================================
   AI MEMORY GREETING
================================================================ */
function showAIMemoryGreeting() {
  const output = document.getElementById("aiChatOutput");
  if (!output || !window.currentUser) return;
  const meta    = window.currentUser.user_metadata || {};
  const name    = meta.full_name ? meta.full_name.split(" ")[0] : null;
  const months  = (window.businessData || []).length;
  const greeting = name ? "Welcome back, " + name + "." : "Welcome back.";
  const existing = output.querySelector(".ai-response");
  if (existing && months > 0) {
    existing.innerHTML =
      "<strong>ImpactGrid AI</strong><br><br>" + greeting +
      " Your " + months + " month" + (months !== 1 ? "s" : "") + " of financial data " +
      (months !== 1 ? "are" : "is") + " loaded and ready for analysis." +
      (window.aiMemoryContext ? " I also have context from your previous reports." : "") +
      "<br><br><div class='ai-suggestions'>" +
      "<button class='ai-suggestion-chip' onclick=\"fillAIChat('Give me a full performance summary')\">Performance summary</button>" +
      "<button class='ai-suggestion-chip' onclick=\"fillAIChat('What are my biggest risks?')\">Risk analysis</button>" +
      "<button class='ai-suggestion-chip' onclick=\"fillAIChat('3 year projection')\">Forecast</button>" +
      "<button class='ai-suggestion-chip' onclick=\"fillAIChat('How can I reduce costs?')\">Reduce costs</button>" +
      "</div>";
  }
}

/* ================================================================
   SAVE REPORT SNAPSHOT
================================================================ */
async function saveReportSnapshot(summaryData) {
  if (!window.currentUser) return;
  try {
    const { error } = await window.supabaseClient.from("user_reports").insert({
      user_id: window.currentUser.id, summary: summaryData.summary||"",
      health_score: summaryData.healthScore||0, total_revenue: summaryData.totalRevenue||0,
      total_expenses: summaryData.totalExpenses||0, total_profit: summaryData.totalProfit||0,
      months_count: summaryData.monthsCount||0, ai_insights: summaryData.aiInsights||"",
      plan: window.currentPlan
    });
    if (error) console.error("Report save error:", error.message);
    else renderReportHistory();
  } catch(e) { console.error("Report save exception:", e); }
}

/* ================================================================
   REPORT HISTORY
================================================================ */
async function renderReportHistory() {
  const container = document.getElementById("reportHistoryList");
  if (!container || !window.currentUser) return;
  container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);font-family:\'JetBrains Mono\',monospace;padding:10px 0;">Loading report history...</div>';
  try {
    const limit = PLAN_CONFIG[window.currentPlan].reportHistory;
    const query = window.supabaseClient.from("user_reports").select("*").eq("user_id", window.currentUser.id).order("report_date", { ascending:false });
    if (limit !== Infinity) query.limit(limit); else query.limit(50);
    const { data, error } = await query;
    if (error) { console.error("Report history error:", error.message); return; }
    if (!data || !data.length) { container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);font-family:\'JetBrains Mono\',monospace;padding:16px 0;">No saved reports yet.</div>'; return; }
    container.innerHTML = data.map(function(r) {
      var date = new Date(r.report_date).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
      var score = r.health_score || 0;
      var scoreColor = score >= 70 ? "#2dd4a0" : score >= 40 ? "#c8a96e" : "#ff4d6d";
      var profitFmt = r.total_profit >= 0
        ? '<span style="color:#2dd4a0;">+£' + Number(r.total_profit).toLocaleString() + '</span>'
        : '<span style="color:#ff4d6d;">−£' + Math.abs(Number(r.total_profit)).toLocaleString() + '</span>';
      return '<div class="report-history-card"><div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">' +
        '<div><div style="font-family:\'Syne\',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);">' + date + '</div>' +
        '<div style="font-size:10px;font-family:\'JetBrains Mono\',monospace;color:var(--text-muted);margin-top:3px;">' + (r.months_count||0) + ' months · ' + (r.plan||"basic") + ' plan</div></div>' +
        '<div style="text-align:right;"><div style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:800;color:' + scoreColor + ';line-height:1;">' + score + '</div>' +
        '<div style="font-size:9px;font-family:\'JetBrains Mono\',monospace;color:var(--text-muted);">HEALTH SCORE</div></div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">' +
        '<div style="text-align:center;padding:8px;background:rgba(6,8,15,0.4);border-radius:6px;"><div style="font-size:11px;color:#2dd4a0;font-family:\'JetBrains Mono\',monospace;font-weight:600;">£' + Number(r.total_revenue||0).toLocaleString() + '</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px;">Revenue</div></div>' +
        '<div style="text-align:center;padding:8px;background:rgba(6,8,15,0.4);border-radius:6px;"><div style="font-size:11px;color:#ff4d6d;font-family:\'JetBrains Mono\',monospace;font-weight:600;">£' + Number(r.total_expenses||0).toLocaleString() + '</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px;">Expenses</div></div>' +
        '<div style="text-align:center;padding:8px;background:rgba(6,8,15,0.4);border-radius:6px;"><div style="font-size:11px;font-family:\'JetBrains Mono\',monospace;font-weight:600;">' + profitFmt + '</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px;">Profit</div></div>' +
        '</div></div>';
    }).join("");
  } catch(e) { console.error("renderReportHistory exception:", e); }
}

/* ================================================================
   AI MEMORY CONTEXT
================================================================ */
async function buildAIMemoryContext() {
  if (!window.currentUser) return "";
  try {
    const { data } = await window.supabaseClient.from("user_reports").select("*")
      .eq("user_id", window.currentUser.id).order("report_date", { ascending:false }).limit(3);
    if (!data || !data.length) { window.aiMemoryContext = ""; return ""; }
    var ctx = "USER REPORT HISTORY (" + data.length + " previous reports):\n";
    data.forEach(function(r, i) {
      var d = new Date(r.report_date).toLocaleDateString("en-GB", { month:"short", year:"numeric" });
      ctx += "\nReport " + (i+1) + " (" + d + "): Health Score " + (r.health_score||0) + "/100, ";
      ctx += "Revenue £" + Number(r.total_revenue||0).toLocaleString() + ", ";
      ctx += "Expenses £" + Number(r.total_expenses||0).toLocaleString() + ", ";
      ctx += "Profit £" + Number(r.total_profit||0).toLocaleString() + ".";
      if (r.ai_insights) ctx += " Key insight: " + r.ai_insights.substring(0,120) + "...";
    });
    window.aiMemoryContext = ctx;
    return ctx;
  } catch(e) { console.error("AI memory error:", e); return ""; }
}

/* ================================================================
   SAVE BADGE
================================================================ */
function showSaveBadge() {
  const badge = document.getElementById("autosaveBadge");
  if (!badge) return;
  badge.style.opacity = "1";
  setTimeout(function() { badge.style.opacity = "0"; }, 2500);
}

/* ================================================================
   UPGRADE / FEATURE MODAL
================================================================ */
function showUpgradePrompt(feature, requiredPlan) {
  const plan  = PLAN_CONFIG[requiredPlan];
  const modal = document.getElementById("upgradeModal");
  if (!modal) return;
  document.getElementById("upgradeFeatureName").textContent = feature;
  document.getElementById("upgradePlanName").textContent    = plan.label;
  document.getElementById("upgradePrice").textContent       = plan.price;
  document.getElementById("upgradeBtn").href                = STRIPE_LINKS[requiredPlan];
  modal.style.display = "flex";
}
function closeUpgradeModal() {
  const modal = document.getElementById("upgradeModal");
  if (modal) modal.style.display = "none";
}

/* ================================================================
   PDF CLICK
================================================================ */
async function handlePDFClick() {
  const allowed = await canUse("pdfs");
  if (!allowed) { showLimitModal("pdfs"); return; }
  await incrementUsage("pdfs");
  if (typeof window.generatePDF === "function") window.generatePDF();
  else console.error("generatePDF not found");
}

/* ================================================================
   PROFILE FIELD AUTO-SAVE
   Saves businessStartDate, reportingDate, businessType, currency
   whenever they change — debounced 800ms.
================================================================ */
document.addEventListener("DOMContentLoaded", function() {
  var saveTimer = null;
  function debouncedSave() {
    if (!window.currentUser) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function() { if (typeof saveUserData === "function") saveUserData(); }, 800);
  }
  ["businessStartDate","reportingDate","businessType","currencySelector"].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", debouncedSave);
      el.addEventListener("input",  debouncedSave);
    }
  });
});

/* ================================================================
   EXPOSE GLOBALS
================================================================ */
window.initPlanSystem       = initPlanSystem;
window.saveUserData         = saveUserData;

window.loadUserData         = loadUserData;
window.canUse               = canUse;
window.incrementUsage       = incrementUsage;
window.checkAIQuestion      = checkAIQuestion;
window.aiUpgradeNudge       = aiUpgradeNudge;
window.checkForecast        = checkForecast;
window.igSessionStart       = igSessionStart;
window.igSessionClose       = igSessionClose;
window.showLimitModal       = showLimitModal;
window.closeLimitModal      = closeLimitModal;
window.showUpgradePrompt    = showUpgradePrompt;
window.closeUpgradeModal    = closeUpgradeModal;
window.saveReportSnapshot   = saveReportSnapshot;
window.renderReportHistory  = renderReportHistory;
window.buildAIMemoryContext = buildAIMemoryContext;
window.updateUsageBar       = updateUsageBar;
window.handlePDFClick       = handlePDFClick;
window.STRIPE_LINKS         = STRIPE_LINKS;
window.PLAN_CONFIG          = PLAN_CONFIG;

/* ================================================================
   PDF STORAGE
================================================================ */
async function savePDFToAccount(pdfBase64, metadata) {
  if (!window.currentUser) return;
  try {
    const limit = PLAN_CONFIG[window.currentPlan].reportHistory;
    if (limit !== Infinity) {
      const { count } = await window.supabaseClient.from("user_pdfs").select("id", { count:"exact" }).eq("user_id", window.currentUser.id);
      if (count >= limit) {
        const { data: oldest } = await window.supabaseClient.from("user_pdfs").select("id").eq("user_id", window.currentUser.id).order("created_at", { ascending:true }).limit(1);
        if (oldest && oldest.length) await window.supabaseClient.from("user_pdfs").delete().eq("id", oldest[0].id);
      }
    }
    const filename = "ImpactGrid-Report-" + new Date().toLocaleDateString("en-GB").replace(/\//g,"-") + ".pdf";
    const { error } = await window.supabaseClient.from("user_pdfs").insert({
      user_id: window.currentUser.id, filename, pdf_data: pdfBase64,
      months_count: metadata.monthsCount||0, health_score: metadata.healthScore||0, plan: window.currentPlan
    });
    if (error) console.error("PDF save error:", error.message);
    else renderSavedPDFs();
  } catch(e) { console.error("PDF save exception:", e); }
}

async function renderSavedPDFs() {
  const container = document.getElementById("savedPDFsList");
  if (!container || !window.currentUser) return;
  container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">Loading...</div>';
  try {
    const { data, error } = await window.supabaseClient.from("user_pdfs")
      .select("id, created_at, filename, months_count, health_score, plan").eq("user_id", window.currentUser.id).order("created_at", { ascending:false });
    if (error) { console.error("PDF list error:", error.message); return; }
    if (!data || !data.length) { container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No saved reports yet.</div>'; return; }
    container.innerHTML = data.map(function(p) {
      var date = new Date(p.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
      var time = new Date(p.created_at).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
      var score = p.health_score || 0;
      var scoreColor = score >= 70 ? "#2dd4a0" : score >= 40 ? "#c8a96e" : "#ff4d6d";
      return '<div class="saved-pdf-card"><div style="display:flex;align-items:center;gap:14px;">' +
        '<div style="width:42px;height:42px;border-radius:10px;background:rgba(200,169,110,0.1);border:1px solid rgba(200,169,110,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">⊡</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-family:\'Syne\',sans-serif;font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (p.filename||"Report") + '</div>' +
        '<div style="font-size:10px;font-family:\'JetBrains Mono\',monospace;color:var(--text-muted);margin-top:2px;">' + date + ' · ' + time + ' · ' + (p.months_count||0) + ' months</div></div>' +
        '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
        '<div style="text-align:center;"><div style="font-family:\'Syne\',sans-serif;font-size:16px;font-weight:800;color:' + scoreColor + ';line-height:1;">' + score + '</div><div style="font-size:8px;font-family:\'JetBrains Mono\',monospace;color:var(--text-muted);">SCORE</div></div>' +
        '<button onclick="downloadSavedPDF(\'' + p.id + '\')" style="padding:8px 14px;background:linear-gradient(135deg,rgba(200,169,110,0.15),rgba(226,201,138,0.1));border:1px solid rgba(200,169,110,0.3);border-radius:7px;color:var(--gold-light);font-size:11px;font-family:\'JetBrains Mono\',monospace;cursor:pointer;white-space:nowrap;">↓ Download</button>' +
        '</div></div></div>';
    }).join("");
  } catch(e) { console.error("renderSavedPDFs error:", e); }
}

async function downloadSavedPDF(pdfId) {
  try {
    const btn = event.target; btn.textContent = "Loading..."; btn.style.opacity = "0.7";
    const { data, error } = await window.supabaseClient.from("user_pdfs").select("pdf_data, filename").eq("id", pdfId).eq("user_id", window.currentUser.id).single();
    if (error || !data) { btn.textContent = "↓ Download"; btn.style.opacity = "1"; return; }
    var binary = atob(data.pdf_data); var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var blob = new Blob([bytes], { type:"application/pdf" });
    var url  = URL.createObjectURL(blob); var a = document.createElement("a");
    a.href = url; a.download = data.filename||"ImpactGrid-Report.pdf"; a.click(); URL.revokeObjectURL(url);
    btn.textContent = "↓ Download"; btn.style.opacity = "1";
  } catch(e) { console.error("Download exception:", e); }
}

window.savePDFToAccount = savePDFToAccount;
window.renderSavedPDFs  = renderSavedPDFs;
window.downloadSavedPDF = downloadSavedPDF;
