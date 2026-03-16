/* ================= GLOBAL STATE ================= */

// businessData is shared with plans.js via window.businessData
// Always access through window.businessData so data persists across login
if (!window.businessData) window.businessData = [];
var businessData = window.businessData; // reference, not copy
let currentCurrency   = "GBP";

let revenueChart      = null;
let profitChart       = null;
let expenseChart      = null;
let performanceBarChart   = null;
let distributionPieChart  = null;
let aiForecastChart       = null;

/* ── New section chart refs ── */
var _riskRadarChart = null;

let aiChatHistory     = [];
let lastAIInsightText = "";


/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", function() {
  bindGlobalFunctions();

  /* Light mode is DEFAULT — only switch to dark if user previously chose dark */
  try {
    var savedTheme = localStorage.getItem("ig-theme");
    if (savedTheme === "dark") {
      toggleTheme(false);
    } else {
      toggleTheme(true);
    }
  } catch(e) {
    toggleTheme(true);
  }

  renderAIInsights();

  if (typeof initPlanSystem === "function") {
    initPlanSystem().then(function() {
      if (typeof buildAIMemoryContext === 'function') buildAIMemoryContext();
    });
  }

  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") closeEditModal();
  });

  var modal = document.getElementById("editModal");
  if (modal) {
    modal.addEventListener("click", function(e) {
      if (e.target === modal) closeEditModal();
    });
  }
});


/* ================= CURRENCY ================= */

function setCurrency(currency) {
  currentCurrency = currency;
  updateAll();
}

function formatCurrency(val) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currentCurrency
  }).format(val);
}


/* ================= ADD DATA ================= */

async function addData() {
  var monthValue = document.getElementById("month").value;
  var revenue    = parseFloat(document.getElementById("revenue").value);
  var expenses   = parseFloat(document.getElementById("expenses").value);

  if (!monthValue || isNaN(revenue) || isNaN(expenses)) {
    alert("Please fill in the month, revenue, and expenses fields.");
    return;
  }

  var exists = businessData.some(function(d) {
    return d.date.toISOString().slice(0, 7) === monthValue;
  });
  if (exists) {
    var warn = document.getElementById("duplicateWarning");
    if (warn) { warn.style.display = "block"; }
    alert("You have already entered data for " + monthValue + ". Use the Edit button in the table to update it.");
    return;
  }

  var date   = new Date(monthValue + "-01");
  var profit = revenue - expenses;

  businessData.push({ date: date, revenue: revenue, expenses: expenses, profit: profit });
  businessData.sort(function(a, b) { return a.date - b.date; });
  window.businessData = businessData;

  document.getElementById("month").value    = "";
  document.getElementById("revenue").value  = "";
  document.getElementById("expenses").value = "";
  var warn = document.getElementById("duplicateWarning");
  if (warn) warn.style.display = "none";

  updateAll();
  if (typeof saveUserData === "function") saveUserData();
}


/* ================= DUPLICATE CHECK ================= */

function checkDuplicate() {
  var monthValue = document.getElementById("month").value;
  var warn = document.getElementById("duplicateWarning");
  if (!warn || !monthValue) return;
  var exists = businessData.some(function(d) {
    return d.date.toISOString().slice(0, 7) === monthValue;
  });
  warn.style.display = exists ? "block" : "none";
}


/* ================= MONTH STRING PARSER ================= */

function parseMonthString(str) {
  if (!str) return null;
  str = String(str).trim();

  var iso = str.match(/^(20\d{2})[-\/](0?[1-9]|1[0-2])$/);
  if (iso) return iso[1] + "-" + iso[2].padStart(2,"0");

  var months = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
  var named = str.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s\-\/]*(20\d{2})\b/i);
  if (named) { return named[2] + "-" + months[named[1].toLowerCase().slice(0,3)]; }

  var yearFirst = str.match(/\b(20\d{2})\b[\s\-\/]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i);
  if (yearFirst) { return yearFirst[1] + "-" + months[yearFirst[2].toLowerCase().slice(0,3)]; }

  return null;
}


/* ================= FILE IMPORT ================= */

function handleFileImport(event) {
  var file   = event.target.files[0];
  var status = document.getElementById("importStatus");
  if (!file) return;

  var name = file.name.toLowerCase();
  if (status) { status.textContent = "Reading file…"; status.style.color = "var(--text-secondary)"; }

  if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
    importSpreadsheet(file, status);
  } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
    importWordMammoth(file, status);
  } else if (name.endsWith(".pdf")) {
    importPDF(file, status);
  } else {
    if (status) { status.textContent = "Unsupported file type. Use .xlsx, .csv, .docx, or .pdf"; status.style.color = "var(--danger)"; }
  }
  event.target.value = "";
}

function tryImportRow(month, rev, exp) {
  var parsed = parseMonthString(String(month).trim());
  if (!parsed) return false;
  var r = parseFloat(String(rev).replace(/[£$€₦,\s]/g,""));
  var e = parseFloat(String(exp).replace(/[£$€₦,\s]/g,""));
  if (isNaN(r) || isNaN(e) || r < 0 || e < 0) return false;
  var exists = businessData.some(function(d) {
    return d.date.toISOString().slice(0,7) === parsed;
  });
  if (exists) return "duplicate";
  businessData.push({ date: new Date(parsed+"-01"), revenue: r, expenses: e, profit: r-e });
  return true;
}

function importSpreadsheet(file, statusEl) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb    = XLSX.read(e.target.result, { type: "binary" });
      var sheet = wb.Sheets[wb.SheetNames[0]];
      var rows  = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      var imported = 0, skipped = 0;

      rows.forEach(function(row) {
        var month = findCol(row, ["month","date","period","mo"]);
        var rev   = findCol(row, ["revenue","income","sales","turnover","gross income","total revenue"]);
        var exp   = findCol(row, ["expenses","costs","expenditure","outgoings","total expenses","spend"]);
        if (!month || rev === undefined || exp === undefined) return;
        var result = tryImportRow(month, rev, exp);
        if (result === true)             imported++;
        else if (result === "duplicate") skipped++;
      });

      businessData.sort(function(a,b){ return a.date - b.date; });
      window.businessData = businessData;
      updateAll();
      if (typeof saveUserData === "function") saveUserData();
      setImportStatus(statusEl, imported, skipped, "spreadsheet");
    } catch(err) {
      if (statusEl) { statusEl.textContent = "Error reading file: " + err.message; statusEl.style.color = "var(--danger)"; }
    }
  };
  reader.readAsBinaryString(file);
}

function importWordMammoth(file, statusEl) {
  if (typeof mammoth === "undefined") {
    if (statusEl) { statusEl.textContent = "Word import library not loaded. Please refresh."; statusEl.style.color = "var(--danger)"; }
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    mammoth.extractRawText({ arrayBuffer: e.target.result })
      .then(function(result) {
        var text = result.value;
        var imported = 0, skipped = 0;

        var lines = text.split(/\n/);
        lines.forEach(function(line) {
          line = line.trim();
          if (!line) return;
          var monthRx = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[\s\-\/]?\s*(20\d{2})\b/i;
          var isoRx   = /\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/;
          var mMatch  = line.match(monthRx) || line.match(isoRx);
          if (!mMatch) return;
          var nums = line.replace(mMatch[0],"").match(/[\d,]+(?:\.\d+)?/g);
          if (!nums || nums.length < 2) return;
          var result = tryImportRow(mMatch[0], nums[0], nums[1]);
          if (result === true)             imported++;
          else if (result === "duplicate") skipped++;
        });

        if (imported === 0) {
          var fullRx = /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+20\d{2}|20\d{2}[-\/]\d{1,2})\b[^\d]*([\d,]+(?:\.\d+)?)[^\d]+([\d,]+(?:\.\d+)?)/gi;
          var m;
          while ((m = fullRx.exec(text)) !== null) {
            var result = tryImportRow(m[1], m[2], m[3]);
            if (result === true)             imported++;
            else if (result === "duplicate") skipped++;
          }
        }

        businessData.sort(function(a,b){ return a.date - b.date; });
        window.businessData = businessData;
        updateAll();
        if (typeof saveUserData === "function") saveUserData();
        setImportStatus(statusEl, imported, skipped, "Word document");
      })
      .catch(function(err) {
        if (statusEl) { statusEl.textContent = "Error reading Word file: " + err.message; statusEl.style.color = "var(--danger)"; }
      });
  };
  reader.readAsArrayBuffer(file);
}

function importPDF(file, statusEl) {
  if (statusEl) { statusEl.textContent = "Reading PDF..."; statusEl.style.color = "var(--text-secondary)"; }

  var doProcess = function() {
    var reader = new FileReader();
    reader.onload = function(e) {
      var typedArray = new Uint8Array(e.target.result);
      window.pdfjsLib.getDocument(typedArray).promise.then(function(pdf) {
        var pagePromises = [];
        for (var p = 1; p <= pdf.numPages; p++) {
          pagePromises.push(
            pdf.getPage(p).then(function(page) {
              return page.getTextContent().then(function(tc) {
                return tc.items.map(function(i){ return i.str; }).join(" ");
              });
            })
          );
        }
        Promise.all(pagePromises).then(function(pages) {
          var allText = pages.join("\n");
          var imported = 0, skipped = 0;

          var lines = allText.split(/\n/);
          lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;
            var monthRx = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[\s\-\/]?\s*(20\d{2})\b/i;
            var isoRx   = /\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/;
            var mMatch  = line.match(monthRx) || line.match(isoRx);
            if (!mMatch) return;
            var nums = line.replace(mMatch[0],"").match(/[\d,]+(?:\.\d+)?/g);
            if (!nums || nums.length < 2) return;
            var result = tryImportRow(mMatch[0], nums[0], nums[1]);
            if (result === true)             imported++;
            else if (result === "duplicate") skipped++;
          });

          if (imported === 0) {
            var fullRx = /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+20\d{2}|20\d{2}[-\/]\d{1,2})\b[^\d]*([\d,]+(?:\.\d+)?)[^\d]+([\d,]+(?:\.\d+)?)/gi;
            var m;
            while ((m = fullRx.exec(allText)) !== null) {
              var result = tryImportRow(m[1], m[2], m[3]);
              if (result === true)             imported++;
              else if (result === "duplicate") skipped++;
            }
          }

          businessData.sort(function(a,b){ return a.date - b.date; });
          window.businessData = businessData;
          updateAll();
          if (typeof saveUserData === "function") saveUserData();
          setImportStatus(statusEl, imported, skipped, "PDF");
        });
      }).catch(function(err) {
        if (statusEl) { statusEl.textContent = "Error reading PDF: " + err.message; statusEl.style.color = "var(--danger)"; }
      });
    };
    reader.readAsArrayBuffer(file);
  };

  if (typeof pdfjsLib !== "undefined" && window.pdfjsLib) {
    doProcess();
  } else {
    var script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = function() {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      doProcess();
    };
    script.onerror = function() {
      if (statusEl) { statusEl.textContent = "PDF support unavailable. Please use Excel or CSV format."; statusEl.style.color = "var(--danger)"; }
    };
    document.head.appendChild(script);
  }
}

function setImportStatus(statusEl, imported, skipped, source) {
  if (!statusEl) return;
  if (imported > 0) {
    var msg = "✓ Imported " + imported + " month" + (imported !== 1 ? "s" : "") + " from " + source;
    if (skipped > 0) msg += "  ·  " + skipped + " skipped (duplicate)";
    statusEl.textContent = msg;
    statusEl.style.color = "var(--success)";
  } else {
    statusEl.textContent = "⚠ No financial data found. Make sure your file has Month, Revenue, and Expenses columns.";
    statusEl.style.color = "var(--warning)";
  }
}

function findCol(row, keys) {
  var rowKeys = Object.keys(row);
  for (var k = 0; k < keys.length; k++) {
    for (var r = 0; r < rowKeys.length; r++) {
      if (rowKeys[r].toLowerCase().replace(/[^a-z]/g,"").indexOf(keys[k].replace(/[^a-z]/g,"")) !== -1) {
        return row[rowKeys[r]];
      }
    }
  }
  return undefined;
}


/* ================= EDIT MODAL ================= */

function openEditModal(index) {
  var record = businessData[index];
  if (!record) return;

  document.getElementById("editIndex").value   = index;
  document.getElementById("editModalTitle").textContent = record.date.toISOString().slice(0, 7);
  document.getElementById("editRevenue").value  = record.revenue;
  document.getElementById("editExpenses").value = record.expenses;

  var modal = document.getElementById("editModal");
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(function() { document.getElementById("editRevenue").focus(); }, 50);
}

function closeEditModal() {
  var modal = document.getElementById("editModal");
  modal.style.display = "none";
  document.body.style.overflow = "";
}

function saveEdit() {
  var index    = parseInt(document.getElementById("editIndex").value);
  var revenue  = parseFloat(document.getElementById("editRevenue").value);
  var expenses = parseFloat(document.getElementById("editExpenses").value);

  if (isNaN(revenue) || isNaN(expenses)) {
    alert("Please enter valid numbers for revenue and expenses.");
    return;
  }

  businessData[index].revenue  = revenue;
  businessData[index].expenses = expenses;
  businessData[index].profit   = revenue - expenses;
  window.businessData = businessData;

  closeEditModal();
  updateAll();
  if (typeof saveUserData === "function") saveUserData();
}

function deleteRecord() {
  var index = parseInt(document.getElementById("editIndex").value);
  var record = businessData[index];
  if (!record) return;

  if (confirm("Delete record for " + record.date.toISOString().slice(0,7) + "? This cannot be undone.")) {
    businessData.splice(index, 1);
    window.businessData = businessData;
    closeEditModal();
    updateAll();
    if (typeof saveUserData === "function") saveUserData();
  }
}


/* ================= MASTER UPDATE ================= */

function updateAll() {
  renderRecordsTable();
  updateProgressIndicator();
  renderCoreCharts();
  renderAIInsights();

  if (businessData.length >= 3) {
    renderPerformanceMatrix();
    renderRiskAssessment();
  }

  /* ── New sections: KPI cards, gauge, benchmark, risk radar, Dijo insight ── */
  try { updateMatrixSection(); } catch(e){ console.warn('[updateAll] matrix:', e); }
  try { updateRiskSection();   } catch(e){ console.warn('[updateAll] risk:', e);   }

  var panel = document.getElementById("recordsPanel");
  if (panel && panel.classList.contains("open")) {
    renderRecordsPanel();
  }
}


/* ================= RECORDS TABLE ================= */

function renderRecordsTable() {
  var tbody = document.getElementById("recordsTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (businessData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:28px;font-family:monospace;font-size:12px;">No records yet — add your first month above</td></tr>';
    return;
  }

  businessData.forEach(function(record, index) {
    var profitColor = record.profit >= 0 ? "var(--success)" : "var(--danger)";
    var row = document.createElement("tr");
    row.innerHTML =
      "<td>" + record.date.toISOString().slice(0, 7) + "</td>" +
      "<td>" + formatCurrency(record.revenue) + "</td>" +
      "<td>" + formatCurrency(record.expenses) + "</td>" +
      '<td style="color:' + profitColor + ';font-weight:600;">' + formatCurrency(record.profit) + "</td>" +
      '<td style="text-align:center;">' +
        '<button onclick="openEditModal(' + index + ')" style="' +
          'background:var(--bg-mid);border:1px solid var(--border-mid);border-radius:6px;' +
          'color:var(--gold);font-size:11px;font-family:monospace;padding:4px 10px;cursor:pointer;' +
          'transition:background 0.15s;" ' +
          'onmouseenter="this.style.background=\'var(--gold-glow)\'" ' +
          'onmouseleave="this.style.background=\'var(--bg-mid)\'">&#9998; Edit</button>' +
      "</td>";
    tbody.appendChild(row);
  });
}


/* ================= PROGRESS INDICATOR ================= */

function updateProgressIndicator() {
  var progress = document.getElementById("dataProgress");
  if (!progress) return;
  var count = businessData.length;
  if (count < 3) {
    progress.innerHTML = count + " / 3 months entered &nbsp;&middot;&nbsp; Add " + (3 - count) + " more month" + (3 - count !== 1 ? "s" : "") + " to activate ImpactGrid Insights";
  } else {
    progress.innerHTML = '<span style="color:var(--success);">&#9679;</span> &nbsp;' + count + ' months recorded &nbsp;&middot;&nbsp; <strong style="color:var(--gold-light);">ImpactGrid Insights Active</strong>';
  }
}


/* ================= CORE CHARTS ================= */

function renderCoreCharts() {
  var labels = businessData.map(function(d) { return d.date.toISOString().slice(0, 7); });

  if (revenueChart)  { revenueChart.destroy();  revenueChart  = null; }
  if (profitChart)   { profitChart.destroy();   profitChart   = null; }
  if (expenseChart)  { expenseChart.destroy();  expenseChart  = null; }

  revenueChart = createStyledChart("revenueChart", "line", labels,
    businessData.map(function(d) { return d.revenue; }),
    "Revenue", "rgba(200,169,110,0.9)", "rgba(200,169,110,0.08)");

  profitChart = createStyledChart("profitChart", "line", labels,
    businessData.map(function(d) { return d.profit; }),
    "Profit / Loss", "rgba(45,212,160,0.9)", "rgba(45,212,160,0.08)");

  expenseChart = createStyledChart("expenseChart", "bar", labels,
    businessData.map(function(d) { return d.expenses; }),
    "Expenses", "rgba(255,77,109,0.85)", "rgba(255,77,109,0.08)");
}

function createStyledChart(id, type, labels, data, label, color, fillColor) {
  var canvas = document.getElementById(id);
  if (!canvas) return null;
  var isBar = (type === "bar");

  return new Chart(canvas, {
    type: type,
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        borderColor: color,
        backgroundColor: isBar ? color : fillColor,
        borderWidth: isBar ? 0 : 2,
        pointBackgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: !isBar,
        borderRadius: isBar ? 6 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "rgba(122,139,168,0.9)", font: { family: "monospace", size: 11 } } },
        tooltip: {
          backgroundColor: "#121729", borderColor: "#222b42", borderWidth: 1,
          titleColor: "#edf0f7", bodyColor: "#7a8ba8", padding: 12,
          callbacks: { label: function(ctx) { return " " + formatCurrency(ctx.raw); } }
        }
      },
      scales: {
        x: { ticks: { color: "#3d4e68", font: { family: "monospace", size: 10 } }, grid: { color: "rgba(26,32,53,0.8)" } },
        y: { ticks: { color: "#3d4e68", font: { family: "monospace", size: 10 }, callback: function(val) { return formatCurrency(val); } }, grid: { color: "rgba(26,32,53,0.8)" } }
      }
    }
  });
}


/* ================= AI FORECAST ================= */

async function generateAIProjection(years) {
  if (businessData.length < 3) return;

  if (typeof canUse === "function") {
    var ok = await canUse("forecasts");
    if (!ok) { if (typeof showLimitModal === "function") showLimitModal("forecasts"); return; }
  }

  var canvas      = document.getElementById("aiForecastChart");
  var explanation = document.getElementById("aiForecastExplanation");
  if (!canvas) return;

  if (aiForecastChart) { aiForecastChart.destroy(); aiForecastChart = null; }

  var growthRates = [];
  for (var i = 1; i < businessData.length; i++) {
    if (businessData[i - 1].revenue > 0) {
      growthRates.push((businessData[i].revenue - businessData[i - 1].revenue) / businessData[i - 1].revenue);
    }
  }

  var avgGrowth = growthRates.length > 0
    ? growthRates.reduce(function(a, b) { return a + b; }, 0) / growthRates.length
    : 0;

  var revenue = businessData[businessData.length - 1].revenue;
  var labels = [], base = [], optimistic = [], conservative = [];

  for (var y = 1; y <= years; y++) {
    revenue = revenue * Math.pow(1 + avgGrowth, 12);
    var b = Math.max(0, Math.round(revenue));
    labels.push("Year " + y);
    base.push(b);
    optimistic.push(Math.round(b * 1.15));
    conservative.push(Math.round(b * 0.85));
  }

  aiForecastChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        { label: "Optimistic (+15%)", data: optimistic, borderColor: "rgba(45,212,160,0.55)", backgroundColor: "transparent", borderDash: [5,5], tension: 0.4, pointRadius: 3, borderWidth: 1.5 },
        { label: "Base Projection", data: base, borderColor: "rgba(200,169,110,1)", backgroundColor: "rgba(200,169,110,0.06)", tension: 0.4, fill: true, pointBackgroundColor: "rgba(200,169,110,1)", pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5 },
        { label: "Conservative (-15%)", data: conservative, borderColor: "rgba(255,77,109,0.55)", backgroundColor: "transparent", borderDash: [5,5], tension: 0.4, pointRadius: 3, borderWidth: 1.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "rgba(122,139,168,0.9)", font: { family: "monospace", size: 11 }, boxWidth: 14, padding: 16 } },
        tooltip: {
          backgroundColor: "#121729", borderColor: "#222b42", borderWidth: 1,
          titleColor: "#edf0f7", bodyColor: "#7a8ba8", padding: 12,
          callbacks: { label: function(ctx) { return " " + ctx.dataset.label + ": " + formatCurrency(ctx.raw); } }
        }
      },
      scales: {
        x: { ticks: { color: "#3d4e68", font: { family: "monospace", size: 10 } }, grid: { color: "rgba(26,32,53,0.8)" } },
        y: { ticks: { color: "#3d4e68", font: { family: "monospace", size: 10 }, callback: function(val) { return formatCurrency(val); } }, grid: { color: "rgba(26,32,53,0.8)" } }
      }
    }
  });

  if (typeof incrementUsage === "function") incrementUsage("forecasts");

  if (explanation) {
    explanation.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px;">' +
        tile("Optimistic", formatCurrency(optimistic[optimistic.length - 1]), "rgba(45,212,160,0.2)", "#2dd4a0") +
        tile("Base Projection", formatCurrency(base[base.length - 1]), "rgba(200,169,110,0.12)", "#c8a96e") +
        tile("Conservative", formatCurrency(conservative[conservative.length - 1]), "rgba(255,77,109,0.12)", "#ff4d6d") +
      "</div>";
  }
}

function tile(label, value, bg, color) {
  return '<div style="padding:14px 16px;background:' + bg + ';border:1px solid ' + color + '30;border-radius:8px;">' +
    '<div style="font-size:10px;font-family:monospace;color:' + color + ';letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">' + label + '</div>' +
    '<div style="font-size:15px;font-weight:700;color:' + color + ';">' + value + '</div>' +
  '</div>';
}


/* ================= AI INSIGHTS ================= */

function renderAIInsights() {
  var section = document.getElementById("aiInsights");
  if (!section) return;

  if (businessData.length < 1) {
    section.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">Awaiting financial data — insights appear once records are entered.</span>';
    return;
  }

  var totalRevenue = sum("revenue");
  var totalProfit  = sum("profit");
  var margin       = getMargin();
  var growth       = calculateMonthlyGrowth();
  var volatility   = calculateVolatility();

  var anomalies    = ImpactGridAI.detectAnomalies(businessData);
  var anomalyHTML  = anomalies.length > 0
    ? '<p style="color:var(--warning);margin-top:12px;"><strong>&#9888; Anomalies:</strong> ' + anomalies.map(function(a) { return a.date.toISOString().slice(0,7); }).join(", ") + " showed unusual revenue patterns.</p>"
    : "";

  lastAIInsightText = "Total Revenue: " + formatCurrency(totalRevenue) +
    " | Total Profit: " + formatCurrency(totalProfit) +
    " | Profit Margin: " + margin.toFixed(2) + "%" +
    " | Growth: " + growth.toFixed(2) + "%" +
    " | Volatility: " + volatility.toFixed(2) + "%";

  var marginColor     = margin > 20    ? "var(--success)" : margin > 10 ? "var(--gold-light)" : "var(--danger)";
  var growthColor     = growth >= 0    ? "var(--success)" : "var(--danger)";
  var volatilityColor = volatility < 15 ? "var(--success)" : volatility < 30 ? "var(--warning)" : "var(--danger)";

  section.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">' +
      metricTile("Total Revenue",  formatCurrency(totalRevenue), "var(--gold-light)") +
      metricTile("Total Profit",   formatCurrency(totalProfit),  totalProfit >= 0 ? "var(--success)" : "var(--danger)") +
      metricTile("Profit Margin",  margin.toFixed(2) + "%",      marginColor) +
      metricTile("Revenue Growth", growth.toFixed(2) + "%",      growthColor) +
      metricTile("Volatility",     volatility.toFixed(2) + "%",  volatilityColor) +
    "</div>" +
    (anomalyHTML ? '<div style="margin-top:14px;">' + anomalyHTML + "</div>" : "");
}

function metricTile(label, value, color) {
  return '<div style="padding:14px 16px;background:var(--bg-mid);border:1px solid var(--border);border-radius:8px;">' +
    '<div style="font-size:10px;font-family:monospace;color:var(--text-muted);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">' + label + "</div>" +
    '<div style="font-size:16px;font-weight:700;color:' + color + ';">' + value + "</div>" +
  "</div>";
}


/* ================= PERFORMANCE MATRIX (legacy — kept for compatibility) ================= */

function renderPerformanceMatrix() {
  var volatility = calculateVolatility();
  var growth     = calculateMonthlyGrowth();
  var margin     = getMargin();

  var stabilityScore = Math.min(100, Math.max(0, parseFloat((100 - volatility).toFixed(1))));
  var growthScore    = Math.min(100, Math.max(0, parseFloat(Math.min(growth, 100).toFixed(1))));
  var profitScore    = Math.min(100, Math.max(0, parseFloat(Math.min(margin * 2, 100).toFixed(1))));

  if (performanceBarChart)  { performanceBarChart.destroy();  performanceBarChart  = null; }
  if (distributionPieChart) { distributionPieChart.destroy(); distributionPieChart = null; }

  var barCanvas = document.getElementById("performanceBarChart");
  if (barCanvas) {
    performanceBarChart = new Chart(barCanvas, {
      type: "bar",
      data: {
        labels: ["Stability Index", "Growth Score", "Profit Score"],
        datasets: [
          { label: "Score", data: [stabilityScore, growthScore, profitScore], backgroundColor: ["rgba(45,212,160,0.85)", "rgba(200,169,110,0.85)", "rgba(61,127,255,0.85)"], borderWidth: 0, borderRadius: 6, barThickness: 28 },
          { label: "Remaining", data: [100 - stabilityScore, 100 - growthScore, 100 - profitScore], backgroundColor: "rgba(26,32,53,0.6)", borderWidth: 0, borderRadius: 6, barThickness: 28 }
        ]
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "#121729", borderColor: "#222b42", borderWidth: 1, titleColor: "#edf0f7", bodyColor: "#7a8ba8", padding: 12, filter: function(item) { return item.datasetIndex === 0; }, callbacks: { label: function(ctx) { return " Score: " + ctx.raw.toFixed(1) + " / 100"; } } }
        },
        scales: {
          x: { stacked: true, max: 100, ticks: { color: "#3d4e68", font: { family: "monospace", size: 10 }, callback: function(val) { return val + "%"; } }, grid: { color: "rgba(26,32,53,0.8)" } },
          y: { stacked: true, ticks: { color: "#7a8ba8", font: { size: 12 } }, grid: { display: false } }
        }
      }
    });
  }

  var pieCanvas = document.getElementById("distributionPieChart");
  if (pieCanvas) {
    var container = pieCanvas.parentElement;
    pieCanvas.style.display = "none";
    var existing = container.querySelector(".gauge-grid");
    if (existing) existing.remove();
    container.insertAdjacentHTML("beforeend",
      '<div class="gauge-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:8px 0;">' +
        gaugeCard("stability", "Stability", stabilityScore, "#2dd4a0") +
        gaugeCard("growth",    "Growth",    growthScore,    "#c8a96e") +
        gaugeCard("profit",    "Profit",    profitScore,    "#3d7fff") +
      "</div>"
    );
    setTimeout(function() {
      drawGauge("gauge-stability", stabilityScore, "#2dd4a0");
      drawGauge("gauge-growth",    growthScore,    "#c8a96e");
      drawGauge("gauge-profit",    profitScore,    "#3d7fff");
    }, 50);
  }

  var health = Math.min(100, Math.max(0, Math.round((stabilityScore + growthScore + profitScore) / 3)));
  var healthColor  = health >= 70 ? "#2dd4a0" : health >= 40 ? "#c8a96e" : "#ff4d6d";
  var healthBorder = health >= 70 ? "rgba(45,212,160,0.3)" : health >= 40 ? "rgba(200,169,110,0.3)" : "rgba(255,77,109,0.3)";
  var healthLabel  = health >= 70 ? "Healthy" : health >= 40 ? "Moderate" : "At Risk";

  setText("businessHealthIndex",
    '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
      '<div style="padding:14px 22px;background:var(--bg-mid);border:1px solid ' + healthBorder + ';border-radius:8px;">' +
        '<div style="font-size:10px;font-family:monospace;color:var(--text-muted);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px;">Business Health Score</div>' +
        '<div style="font-size:28px;font-weight:800;color:' + healthColor + ';line-height:1;">' + health + '<span style="font-size:14px;opacity:0.55;margin-left:2px;">/100</span></div>' +
        '<div style="font-size:11px;font-family:monospace;color:' + healthColor + ';margin-top:4px;letter-spacing:0.06em;">' + healthLabel + '</div>' +
      "</div>" +
      '<div style="font-size:12px;color:var(--text-secondary);max-width:360px;line-height:1.7;">Composite score based on revenue stability, growth trajectory, and profit margin. Updates in real time.</div>' +
    "</div>"
  );
}

function gaugeCard(id, label, score, color) {
  return '<div style="text-align:center;padding:12px 8px;background:var(--bg-mid);border:1px solid var(--border);border-radius:12px;">' +
    '<canvas id="gauge-' + id + '" width="120" height="80" style="display:block;margin:0 auto;"></canvas>' +
    '<div style="font-size:18px;font-weight:800;color:' + color + ';margin-top:4px;">' + score.toFixed(0) + '<span style="font-size:11px;opacity:0.45;margin-left:1px;">/100</span></div>' +
    '<div style="font-size:10px;font-family:monospace;color:var(--text-muted);letter-spacing:0.1em;text-transform:uppercase;margin-top:3px;">' + label + "</div>" +
  "</div>";
}

function drawGauge(canvasId, value, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var w = canvas.width, h = canvas.height;
  var cx = w / 2, cy = h * 0.9, r = w * 0.38;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = "rgba(26,32,53,0.9)";
  ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.stroke();

  var endAngle = Math.PI + (value / 100) * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, endAngle);
  ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.lineCap = "round";
  ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.stroke();
  ctx.shadowBlur = 0;
}


/* ================= RISK ASSESSMENT (legacy — kept for compatibility) ================= */

function renderRiskAssessment() {
  var volatility = calculateVolatility();
  var margin     = getMargin();

  var stabilityLevel = volatility > 30 ? "Elevated" : volatility > 15 ? "Moderate" : "Low";
  var marginLevel    = margin < 10     ? "Elevated" : margin < 20     ? "Moderate" : "Low";
  var liquidityLevel = margin > 5      ? "Stable"   : "Weak";

  function riskColor(level) {
    return level === "Low" || level === "Stable" ? "#2dd4a0" : level === "Moderate" ? "#f5a623" : "#ff4d6d";
  }

  setText("stabilityRisk",
    '<span style="color:' + riskColor(stabilityLevel) + ';font-weight:700;">' + stabilityLevel + '</span>' +
    '<span style="color:var(--text-muted);font-size:12px;margin-left:10px;">Volatility: ' + volatility.toFixed(1) + '%</span>'
  );
  setText("marginRisk",
    '<span style="color:' + riskColor(marginLevel) + ';font-weight:700;">' + marginLevel + '</span>' +
    '<span style="color:var(--text-muted);font-size:12px;margin-left:10px;">Margin: ' + margin.toFixed(1) + '%</span>'
  );
  setText("liquidityRisk",
    '<span style="color:' + riskColor(liquidityLevel) + ';font-weight:700;">' + liquidityLevel + '</span>'
  );

  var insight = "Operational risk is currently within manageable bounds.";
  if (volatility > 30) insight = "High revenue volatility detected — consider diversifying income streams to improve stability.";
  if (margin < 10)     insight += " Profit margin is under pressure; a cost structure review is recommended.";
  if (volatility <= 15 && margin >= 20) insight = "Strong financial health — revenue is stable and margins are healthy.";

  setText("riskInsight", insight);
}


/* ================= AI CHAT ================= */

async function askImpactGridAI() {
  if (typeof canUse === "function") {
    var ok = await canUse("analyses");
    if (!ok) { showLimitModal("analyses"); return; }
  }
  var input  = document.getElementById("aiChatInput");
  var output = document.getElementById("aiChatOutput");
  if (!input || !output) return;

  var question = input.value.trim();
  if (question === "") return;

  output.innerHTML += '<div class="ai-user">' + question + "</div>";
  input.value = "";
  output.scrollTop = output.scrollHeight;
  aiChatHistory.push({ role: "user", content: question });

  var typingId = "typing-" + Date.now();
  output.innerHTML += '<div class="ai-response" id="' + typingId + '"><span class="ai-typing">ImpactGrid AI is thinking<span class="dots">...</span></span></div>';
  output.scrollTop = output.scrollHeight;

  var memoryPrefix = window.aiMemoryContext ? window.aiMemoryContext + "\n\nCURRENT SESSION:\n" : "";
  var questionWithMemory = memoryPrefix ? memoryPrefix + question : question;
  var response = await ImpactGridAI.analyze(questionWithMemory, businessData, currentCurrency, aiChatHistory);

  var typingEl = document.getElementById(typingId);
  if (typingEl) typingEl.remove();

  output.innerHTML += '<div class="ai-response">' + response + "</div>";
  output.scrollTop = output.scrollHeight;

  var tmp = document.createElement("div");
  tmp.innerHTML = response;
  lastAIInsightText = tmp.innerText || tmp.textContent || lastAIInsightText;

  aiChatHistory.push({ role: "ai", content: response });
  if (typeof incrementUsage === "function") incrementUsage("analyses");
}

function fillAIChat(text) {
  var input = document.getElementById("aiChatInput");
  if (input) {
    input.value = text;
    input.focus();
    askImpactGridAI();
  }
}


/* ================= PDF ENGINE ================= */

function generatePDF() {
  var _totalRev = businessData.reduce(function(s,d){return s+d.revenue;},0);
  var _totalExp = businessData.reduce(function(s,d){return s+d.expenses;},0);
  var _totalPro = businessData.reduce(function(s,d){return s+d.profit;},0);
  var _insightEl = document.getElementById("aiInsights");
  var _insightText = _insightEl ? (_insightEl.innerText || _insightEl.textContent || "") : "";
  var _healthScore = Math.round(Math.min(100, Math.max(0, _totalRev > 0 ? (_totalPro/_totalRev)*100 + 50 : 50)));
  var _pdfMeta = {
    healthScore:   _healthScore,
    monthsCount:   businessData.length,
    totalRevenue:  Math.round(_totalRev),
    totalExpenses: Math.round(_totalExp),
    totalProfit:   Math.round(_totalPro),
    aiInsights:    _insightText.substring(0, 500)
  };

  if (businessData.length === 0) {
    alert("Add at least one month of data before generating a report.");
    return;
  }

  var jsPDF = window.jspdf.jsPDF;
  var doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  var W = 210, H = 297, mg = 16;
  var cur = currentCurrency || "£";

  var C = {
    bg:[6,8,15], bgMid:[10,13,24], bgCard:[14,18,32], bgCard2:[18,23,42],
    gold:[200,169,110], goldLt:[226,201,138], green:[45,212,160], red:[255,77,109],
    blue:[68,136,255], textPri:[237,240,247], textSec:[160,176,204], textMut:[61,78,104], border:[26,32,53]
  };

  function setF(col) { doc.setFillColor(col[0],col[1],col[2]); }
  function setD(col) { doc.setDrawColor(col[0],col[1],col[2]); }
  function setT(col) { doc.setTextColor(col[0],col[1],col[2]); }
  function rect(x,y,w,h,col) { setF(col); doc.rect(x,y,w,h,"F"); }
  function rrect(x,y,w,h,col,r,stroke) {
    setF(col);
    if(stroke){ setD(stroke); doc.setLineWidth(0.2); doc.roundedRect(x,y,w,h,r||2,r||2,"FD"); }
    else doc.roundedRect(x,y,w,h,r||2,r||2,"F");
  }
  function rule(y,col,lw) { setD(col||C.border); doc.setLineWidth(lw||0.2); doc.line(mg,y,W-mg,y); }
  function label(txt,x,y,sz,col,style) {
    doc.setFontSize(sz||8); doc.setFont("helvetica",style||"normal"); setT(col||C.textSec);
    doc.text(txt,x,y);
  }
  function fmt(n) {
    if(Math.abs(n)>=1000000) return cur+(n/1000000).toFixed(1)+"M";
    if(Math.abs(n)>=1000) return cur+(n/1000).toFixed(1)+"K";
    return cur+Math.round(n).toLocaleString();
  }
  function wrap(txt,maxW) { return doc.splitTextToSize(txt, maxW); }

  /* PAGE 1 */
  rect(0,0,W,H,C.bg); rect(0,0,W,1.5,C.gold); rect(0,0,4,H,C.bgCard); rect(0,0,4,60,C.gold);
  doc.setFontSize(95); doc.setFont("helvetica","bold"); setT([10,14,26]); doc.text("IG",W-60,H-20);
  rrect(mg+6,18,52,14,C.bgCard2,2,C.border);
  label("IMPACTGRID",mg+10,27,11,C.gold,"bold"); label("ANALYTICS",mg+10,32,6,C.textMut);
  setD(C.gold); doc.setLineWidth(0.4); doc.line(mg+6,38,90,38);
  doc.setFontSize(26); doc.setFont("helvetica","bold"); setT(C.textPri); doc.text("Financial",mg+6,54);
  doc.setFontSize(26); setT(C.gold); doc.text("Intelligence",mg+6,63);
  doc.setFontSize(26); setT(C.textPri); doc.text("Report",mg+6,72);
  label("Know if your business is healthy. Know exactly what to do next.",mg+6,80,7,C.textMut);

  var cards = [
    {label:"HEALTH SCORE",val:_healthScore+"/100",col:_healthScore>=70?C.green:_healthScore>=40?C.gold:C.red},
    {label:"TOTAL REVENUE",val:fmt(_totalRev),col:C.blue},
    {label:"NET PROFIT",val:fmt(_totalPro),col:_totalPro>=0?C.green:C.red},
    {label:"MONTHS",val:businessData.length,col:C.goldLt}
  ];
  var cardY=96, cardW=(W-mg*2-12)/4, cardH=22;
  cards.forEach(function(c,i){
    var cx=mg+i*(cardW+4);
    rrect(cx,cardY,cardW,cardH,C.bgCard2,3,C.border);
    setF(c.col); doc.roundedRect(cx,cardY,cardW,1,0.5,0.5,"F");
    label(c.label,cx+4,cardY+7,6,C.textMut,"bold");
    doc.setFontSize(11); doc.setFont("helvetica","bold"); setT(c.col); doc.text(String(c.value||c.val),cx+4,cardY+16);
  });

  var metaY=128;
  rrect(mg,metaY,W-mg*2,32,C.bgCard,3,C.border);
  label("REPORT DETAILS",mg+6,metaY+8,7,C.gold,"bold"); rule(metaY+11,C.border,0.15);
  var metaItems=[
    ["Generated",new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})],
    ["Currency",cur],
    ["Data Period",businessData.length>0?businessData[0].date.toISOString().slice(0,7)+" – "+businessData[businessData.length-1].date.toISOString().slice(0,7):"—"],
    ["Plan",(window.currentPlan||"analyst").charAt(0).toUpperCase()+(window.currentPlan||"analyst").slice(1)],
    ["Platform","impactgridanalytics.com"]
  ];
  metaItems.forEach(function(m,i){
    var col=i<3?mg+6:mg+90, row=i<3?metaY+17+(i*6):metaY+17+((i-3)*6);
    label(m[0]+":",col,row,7,C.textMut); label(m[1],col+30,row,7,C.textPri,"bold");
  });

  if(_insightText.length>10){
    var insY=170;
    rrect(mg,insY,W-mg*2,38,C.bgCard2,3,C.border);
    setF(C.gold); doc.roundedRect(mg,insY,3,38,1.5,1.5,"F");
    label("AI ANALYSIS SUMMARY",mg+8,insY+8,7.5,C.gold,"bold"); rule(insY+11,[26,32,53],0.15);
    var tLines=wrap(_insightText.substring(0,280)+"...",W-mg*2-14);
    doc.setFontSize(7.5); doc.setFont("helvetica","normal"); setT(C.textSec);
    tLines.slice(0,4).forEach(function(l,i){ doc.text(l,mg+8,insY+18+(i*5.5)); });
  }
  rect(0,H-12,W,12,C.bgCard); rule(H-12,C.border,0.15);
  label("ImpactGrid Analytics  ·  Confidential Financial Report",mg,H-5,7,C.textMut);
  label("Page 1",W-mg-8,H-5,7,C.textMut);

  /* PAGE 2 */
  doc.addPage(); rect(0,0,W,H,C.bg); rect(0,0,W,1.5,C.gold); rect(0,0,4,H,C.bgCard);
  rrect(mg,8,W-mg*2,14,C.bgCard,2,C.border);
  label("IMPACTGRID",mg+5,17,8,C.gold,"bold");
  label("  ·  FINANCIAL INTELLIGENCE REPORT",mg+30,17,7,C.textMut);
  label(new Date().toLocaleDateString("en-GB"),W-mg-28,17,7,C.textMut);
  var y2=30;
  label("01  EXECUTIVE SUMMARY",mg,y2,9,C.goldLt,"bold"); rule(y2+2,C.gold,0.3); y2+=8;
  var kpis=[
    {label:"Total Revenue",val:fmt(_totalRev),sub:"Gross inflow",col:C.blue},
    {label:"Total Expenses",val:fmt(_totalExp),sub:"Gross outflow",col:C.red},
    {label:"Net Profit",val:fmt(_totalPro),sub:_totalPro>=0?"Surplus":"Deficit",col:_totalPro>=0?C.green:C.red},
    {label:"Profit Margin",val:(_totalRev>0?((_totalPro/_totalRev)*100).toFixed(1):0)+"%",sub:"Net margin",col:C.goldLt},
    {label:"Avg Monthly Rev",val:fmt(_totalRev/Math.max(1,businessData.length)),sub:"Per month",col:C.blue},
    {label:"Health Score",val:_healthScore+"/100",sub:_healthScore>=70?"Stable":_healthScore>=40?"Moderate":"At Risk",col:_healthScore>=70?C.green:_healthScore>=40?C.gold:C.red}
  ];
  var kw=(W-mg*2-10)/3,kh=18,kpadsY=y2;
  kpis.forEach(function(k,i){
    var kx=mg+(i%3)*(kw+5),ky=kpadsY+Math.floor(i/3)*(kh+3);
    rrect(kx,ky,kw,kh,C.bgCard2,2,C.border);
    setF(k.col); doc.roundedRect(kx,ky,kw,0.8,0.4,0.4,"F");
    label(k.label,kx+4,ky+6,6,C.textMut,"bold");
    doc.setFontSize(10); doc.setFont("helvetica","bold"); setT(k.col); doc.text(String(k.val),kx+4,ky+13);
    label(k.sub,kx+kw-doc.getTextWidth(k.sub)-3,ky+13,6,C.textMut);
  });
  y2+=kh*2+10;
  label("02  MONTHLY BREAKDOWN",mg,y2,9,C.goldLt,"bold"); rule(y2+2,C.gold,0.3); y2+=8;
  var cols=[
    {label:"MONTH",x:mg+2,w:36},{label:"REVENUE",x:mg+40,w:32},{label:"EXPENSES",x:mg+74,w:32},
    {label:"PROFIT",x:mg+108,w:30},{label:"MARGIN",x:mg+140,w:22},{label:"TREND",x:mg+164,w:18}
  ];
  rect(mg,y2,W-mg*2,8,C.bgCard2);
  setD(C.border); doc.setLineWidth(0.2); doc.rect(mg,y2,W-mg*2,8,"S");
  cols.forEach(function(c){ label(c.label,c.x,y2+5.5,6.5,C.gold,"bold"); }); y2+=8;
  businessData.forEach(function(d,i){
    if(y2+7>H-15){ doc.addPage(); rect(0,0,W,H,C.bg); rect(0,0,W,1.5,C.gold); rect(0,0,4,H,C.bgCard); y2=20; }
    rect(mg,y2,W-mg*2,7,i%2===0?C.bgCard:C.bg);
    var marg=d.revenue>0?((d.profit/d.revenue)*100).toFixed(1):"0.0";
    var profCol=d.profit>=0?C.green:C.red;
    var trend=i===0?"—":(d.revenue>businessData[i-1].revenue?"▲":d.revenue<businessData[i-1].revenue?"▼":"–");
    var tCol=i===0?C.textMut:(d.revenue>businessData[i-1].revenue?C.green:d.revenue<businessData[i-1].revenue?C.red:C.textMut);
    label(d.date.toISOString().slice(0,7),cols[0].x,y2+5,7.5,C.textPri,"bold");
    label(fmt(d.revenue),cols[1].x,y2+5,7.5,C.blue);
    label(fmt(d.expenses),cols[2].x,y2+5,7.5,C.red);
    label(fmt(d.profit),cols[3].x,y2+5,7.5,profCol,"bold");
    label(marg+"%",cols[4].x,y2+5,7.5,C.textSec);
    label(trend,cols[5].x,y2+5,8,tCol,"bold");
    y2+=7;
  });
  rect(mg,y2,W-mg*2,8,C.bgCard2);
  setF(C.gold); doc.roundedRect(mg,y2,W-mg*2,0.5,0,0,"F");
  var totMarg=_totalRev>0?((_totalPro/_totalRev)*100).toFixed(1):"0.0";
  label("TOTAL / AVERAGE",cols[0].x,y2+5.5,7,C.gold,"bold");
  label(fmt(_totalRev),cols[1].x,y2+5.5,7,C.blue,"bold"); label(fmt(_totalExp),cols[2].x,y2+5.5,7,C.red,"bold");
  label(fmt(_totalPro),cols[3].x,y2+5.5,7,_totalPro>=0?C.green:C.red,"bold"); label(totMarg+"%",cols[4].x,y2+5.5,7,C.goldLt,"bold");
  rect(0,H-12,W,12,C.bgCard); rule(H-12,C.border,0.15);
  label("ImpactGrid Analytics  ·  Confidential Financial Report",mg,H-5,7,C.textMut);
  label("Page 2",W-mg-8,H-5,7,C.textMut);

  /* PAGE 3 */
  doc.addPage(); rect(0,0,W,H,C.bg); rect(0,0,W,1.5,C.gold); rect(0,0,4,H,C.bgCard);
  rrect(mg,8,W-mg*2,14,C.bgCard,2,C.border);
  label("IMPACTGRID",mg+5,17,8,C.gold,"bold"); label("  ·  AI INTELLIGENCE & RISK ANALYSIS",mg+30,17,7,C.textMut);
  var y3=30;
  label("03  AI FINANCIAL ANALYSIS",mg,y3,9,C.goldLt,"bold"); rule(y3+2,C.gold,0.3); y3+=8;
  if(_insightText.length>10){
    var insBoxH=Math.min(90,16+Math.ceil(_insightText.length/85)*5);
    rrect(mg,y3,W-mg*2,insBoxH,C.bgCard2,3,C.border);
    setF(C.gold); doc.roundedRect(mg,y3,3,insBoxH,1.5,1.5,"F");
    label("ImpactGrid AI  ·  Financial Analysis",mg+7,y3+8,7.5,C.gold,"bold"); rule(y3+11,[26,32,53],0.15);
    var insLines=wrap(_insightText,W-mg*2-14);
    doc.setFontSize(7.5); doc.setFont("helvetica","normal"); setT(C.textSec);
    var lineY=y3+17;
    insLines.forEach(function(l){ if(lineY<y3+insBoxH-4){ doc.text(l,mg+7,lineY); lineY+=5; } });
    y3+=insBoxH+6;
  }
  label("04  RISK ASSESSMENT",mg,y3,9,C.goldLt,"bold"); rule(y3+2,C.gold,0.3); y3+=8;
  var avgRev2=_totalRev/Math.max(1,businessData.length), vol2=0;
  if(businessData.length>1){
    var mean2=avgRev2;
    var var2=businessData.reduce(function(s,d){return s+Math.pow(d.revenue-mean2,2);},0)/businessData.length;
    vol2=Math.round(Math.sqrt(var2)/Math.max(1,mean2)*100);
  }
  var risks=[
    {label:"Revenue Volatility",val:vol2+"%",level:vol2<15?"LOW":vol2<35?"MEDIUM":"HIGH",col:vol2<15?C.green:vol2<35?C.gold:C.red},
    {label:"Expense Ratio",val:(_totalRev>0?((_totalExp/_totalRev)*100).toFixed(0):100)+"%",level:_totalExp/_totalRev<0.7?"LOW":_totalExp/_totalRev<0.9?"MEDIUM":"HIGH",col:_totalExp/_totalRev<0.7?C.green:_totalExp/_totalRev<0.9?C.gold:C.red},
    {label:"Profitability",val:_totalPro>=0?"POSITIVE":"NEGATIVE",level:_totalPro>=0?"LOW":"HIGH",col:_totalPro>=0?C.green:C.red},
    {label:"Cash Flow Pressure",val:_totalPro>=0?"Stable":"Monitor",level:_totalPro>=0?"LOW":"MEDIUM",col:_totalPro>=0?C.green:C.gold}
  ];
  var rw=(W-mg*2-6)/4;
  risks.forEach(function(r,i){
    var rx=mg+i*(rw+2);
    rrect(rx,y3,rw,24,C.bgCard2,2,C.border);
    setF(r.col); doc.roundedRect(rx,y3,rw,1,0.5,0.5,"F");
    label(r.label,rx+3,y3+7,6,C.textMut,"bold");
    doc.setFontSize(9); doc.setFont("helvetica","bold"); setT(r.col); doc.text(r.val,rx+3,y3+14);
    rrect(rx+3,y3+17,rw-6,5,r.col===C.green?[8,40,28]:r.col===C.gold?[40,32,8]:[40,8,20],1.5);
    label(r.level,rx+5,y3+20.5,6,[255,255,255],"bold");
  });
  y3+=30;
  label("05  STABILITY ASSESSMENT",mg,y3,9,C.goldLt,"bold"); rule(y3+2,C.gold,0.3); y3+=8;
  var regime=_healthScore>=70?"STABLE":_healthScore>=40?"MODERATE":"NEEDS ATTENTION";
  var regimeCol=_healthScore>=70?C.green:_healthScore>=40?C.gold:C.red;
  var regimeDesc=_healthScore>=70?"Business demonstrates strong financial health. Revenue exceeds expenses with consistent profitability. Continue current strategy while exploring growth opportunities.":_healthScore>=40?"Business is performing moderately. There are specific areas to improve — review margins and growth trajectory.":"Business needs attention. Focus on reducing expenses, improving cash flow, and strengthening revenue streams.";
  rrect(mg,y3,W-mg*2,30,C.bgCard2,3,C.border);
  setF(regimeCol); doc.roundedRect(mg,y3,W-mg*2,1,1.5,1.5,"F");
  doc.setFontSize(14); doc.setFont("helvetica","bold"); setT(regimeCol); doc.text(regime,mg+6,y3+11);
  label("Health Score: "+_healthScore+"/100",mg+6,y3+17,7,C.textMut);
  wrap(regimeDesc,W-mg*2-12).forEach(function(l,i){ doc.setFontSize(7.5); doc.setFont("helvetica","normal"); setT(C.textSec); doc.text(l,mg+6,y3+22+(i*5)); });
  y3+=36;
  label("06  STRATEGIC RECOMMENDATIONS",mg,y3,9,C.goldLt,"bold"); rule(y3+2,C.gold,0.3); y3+=8;
  var recs=_healthScore>=70?["Maintain current cost discipline — expense ratio is healthy.","Explore reinvestment opportunities to compound revenue growth.","Build a cash reserve of 3–6 months operating expenses.","Consider scaling highest-margin products or services."]:_healthScore>=40?["Identify and reduce the top 3 expense categories immediately.","Set a monthly revenue target 10–15% above current average.","Review pricing strategy — consider value-based pricing.","Diversify revenue streams to reduce single-source dependency."]:["Conduct urgent expense audit — cut all non-essential costs.","Prioritise cash-generating activities over growth investments.","Seek financial advisory support or business mentorship.","Model a break-even scenario and work backwards to achieve it."];
  recs.forEach(function(rec,i){
    if(y3+9>H-15){ doc.addPage(); rect(0,0,W,H,C.bg); rect(0,0,W,1.5,C.gold); rect(0,0,4,H,C.bgCard); y3=20; }
    rrect(mg,y3,W-mg*2,8,C.bgCard,2,C.border);
    setF(C.gold); doc.roundedRect(mg,y3,2,8,1,1,"F");
    label(String(i+1),mg+4,y3+5.5,7,C.gold,"bold"); label(rec,mg+10,y3+5.5,7.5,C.textPri); y3+=10;
  });
  rect(0,H-12,W,12,C.bgCard); rule(H-12,C.border,0.15);
  label("ImpactGrid Analytics  ·  Confidential — For Authorised Use Only",mg,H-5,7,C.textMut);
  label("Page 3",W-mg-8,H-5,7,C.textMut);

  /* PAGE 4 */
  doc.addPage(); rect(0,0,W,H,C.bg); rect(0,W/2,W/2,H,C.bgCard); rect(0,0,W,1.5,C.gold); rect(W/2,0,0.5,H,C.gold);
  doc.setFontSize(32); doc.setFont("helvetica","bold"); setT(C.gold); doc.text("Impact",mg,60);
  setT(C.textPri); doc.text("Grid",mg,75);
  label("Financial Intelligence · impactgridanalytics.com",mg,85,8,C.textMut);
  setD(C.gold); doc.setLineWidth(0.4); doc.line(mg,92,80,92);
  label("This report was generated by ImpactGrid,",mg,102,8,C.textSec);
  label("your AI-powered financial command centre",mg,109,8,C.textSec);
  label("for SME owners.",mg,116,8,C.textSec);
  label("impactgridanalytics.com",mg,135,9,C.gold,"bold");
  label("Powered by ImpactGrid AI · Secured by Supabase",mg,143,7,C.textMut);
  label("© 2026 ImpactGrid Analytics",mg,151,7,C.textMut);
  var rx2=W/2+mg;
  label("REPORT SUMMARY",rx2,40,8,C.gold,"bold"); setD(C.gold); doc.setLineWidth(0.3); doc.line(rx2,43,W-mg,43);
  var sumItems=[
    ["Health Score",_healthScore+"/100"],["Total Revenue",fmt(_totalRev)],["Total Expenses",fmt(_totalExp)],
    ["Net Profit",fmt(_totalPro)],["Months Analysed",String(businessData.length)],
    ["Status",regime],["Generated",new Date().toLocaleDateString("en-GB")]
  ];
  sumItems.forEach(function(s,i){ label(s[0],rx2,53+(i*10),7.5,C.textMut); label(s[1],rx2+40,53+(i*10),7.5,C.textPri,"bold"); });
  rrect(rx2,H-55,30,30,C.bgCard2,2,C.border);
  label("VISIT",rx2+7,H-28,7,C.textMut,"bold"); label("ONLINE",rx2+5,H-23,7,C.textMut,"bold");
  label("impactgridanalytics.com",rx2+34,H-40,7,C.gold);
  label("Access your full dashboard,",rx2+34,H-34,6.5,C.textMut);
  label("AI insights, and report history",rx2+34,H-29,6.5,C.textMut);
  label("at any time online.",rx2+34,H-24,6.5,C.textMut);
  rect(0,H-8,W,8,C.bgCard); rule(H-8,C.border,0.15);
  label("CONFIDENTIAL  ·  Generated by ImpactGrid  ·  © 2026 ImpactGrid Analytics",mg,H-3,6.5,C.textMut);

  if (typeof savePDFToAccount === "function") {
    try { var b64=doc.output("datauristring").split(",")[1]; savePDFToAccount(b64, _pdfMeta); } catch(e) { console.error("PDF save error:", e); }
  }
  doc.save("ImpactGrid_Report_" + new Date().toISOString().slice(0,10) + ".pdf");
}


/* ================= HELPERS ================= */

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

function calculateMonthlyGrowth() {
  if (businessData.length < 2) return 0;
  var first = businessData[0].revenue;
  var last  = businessData[businessData.length - 1].revenue;
  return first > 0 ? ((last - first) / first) * 100 : 0;
}

function calculateVolatility() {
  if (businessData.length < 2) return 0;
  var revenues = businessData.map(function(d) { return d.revenue; });
  var mean     = revenues.reduce(function(a, b) { return a + b; }, 0) / revenues.length;
  var variance = revenues.reduce(function(a, b) { return a + Math.pow(b - mean, 2); }, 0) / revenues.length;
  return mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
}

function getMargin() {
  var revenue = sum("revenue");
  var profit  = sum("profit");
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

function sum(key) {
  return businessData.reduce(function(a, b) { return a + (b[key] || 0); }, 0);
}


/* ================= NAV ================= */

function showSection(section, event) {
  if (section === 'report') {
    if (typeof renderSavedPDFs === 'function') setTimeout(renderSavedPDFs, 150);
  }
  if (section === 'settings') {
    var email   = window.currentUser ? window.currentUser.email : '';
    var plan    = window.currentPlan || 'analyst';
    var cfg     = window.planConfig  ? window.planConfig[plan] : null;
    var initial = email ? email[0].toUpperCase() : 'U';
    var sa=document.getElementById('settingsAvatar'), se=document.getElementById('settingsEmail');
    var spb=document.getElementById('settingsPlanBadge'), spl=document.getElementById('settingsPlanLabel');
    if (sa) sa.textContent  = initial;
    if (se) se.textContent  = email;
    if (spb){ spb.textContent = cfg ? cfg.label : 'Basic'; spb.className = 'plan-badge plan-' + plan; }
    if (spl) spl.textContent = cfg ? cfg.label + (plan==='analyst'?' (Free)':plan==='professional'?' — £8.99/mo':' — £13.99/mo') : 'Basic (Free)';
    var ub=document.getElementById('usageBar'), sub=document.getElementById('settingsUsageBar');
    if (ub && sub) sub.innerHTML = ub.innerHTML;
  }

  document.querySelectorAll(".page-section").forEach(function(s) { s.classList.remove("active-section"); });
  var target = document.getElementById(section);
  if (target) target.classList.add("active-section");

  document.querySelectorAll(".sidebar li").forEach(function(li) { li.classList.remove("active"); });
  if (event) {
    var li = event.target.closest ? event.target.closest("li") : event.target;
    if (li) li.classList.add("active");
  }

  /* Mobile nav highlight — maps to 5-button nav */
  var sectionIndex = {"dashboard":0,"charts":1,"ai":2,"risk":3,"report":4};
  var idx = sectionIndex[section];
  if (idx !== undefined) {
    var btns = document.querySelectorAll(".mob-nav-btn");
    btns.forEach(function(b) { b.classList.remove("active"); });
    if (btns[idx]) btns[idx].classList.add("active");
  }

  if (window.innerWidth <= 900) closeMobileMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ================= SIDEBAR ================= */

function toggleSidebar() {
  if (window.innerWidth <= 900) { toggleMobileMenu(); return; }
  var sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("collapsed");
  var isCollapsed = sidebar.classList.contains("collapsed");
  var main = document.querySelector(".main-content");
  if (main) main.style.marginLeft = isCollapsed ? "64px" : "260px";
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  var tab = document.getElementById("sidebar-reopen-tab");
  if (isCollapsed) {
    if (!tab) {
      tab = document.createElement("button");
      tab.id = "sidebar-reopen-tab";
      tab.innerHTML = "&#9654;"; tab.title = "Open sidebar";
      tab.style.cssText = "position:fixed;left:0;top:50%;transform:translateY(-50%);width:22px;height:48px;background:var(--bg-surface,#fff);border:1px solid var(--border-mid,#cdd2e8);border-left:none;border-radius:0 6px 6px 0;color:var(--gold,#a07828);font-size:11px;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;";
      tab.onclick = function() { toggleSidebar(); };
      document.body.appendChild(tab);
    }
    tab.style.display = "flex";
  } else {
    if (tab) tab.style.display = "none";
  }
}


/* ================= MOBILE MENU ================= */

function toggleMobileMenu() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sbOverlay");
  if (!sidebar) return;
  if (sidebar.classList.contains("mob-open")) { closeMobileMenu(); }
  else {
    sidebar.classList.add("mob-open");
    if (overlay) { overlay.style.display = "block"; overlay.classList.add("mob-visible"); }
    document.body.style.overflow = "hidden";
  }
}

function closeMobileMenu() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sbOverlay");
  if (sidebar) sidebar.classList.remove("mob-open");
  if (overlay) { overlay.style.display = "none"; overlay.classList.remove("mob-visible"); }
  document.body.style.overflow = "";
}

function mobileNav(section, el) {
  document.querySelectorAll(".page-section").forEach(function(s) { s.classList.remove("active-section"); });
  var target = document.getElementById(section);
  if (target) target.classList.add("active-section");
  document.querySelectorAll(".mob-nav-btn").forEach(function(b) { b.classList.remove("active"); });
  if (el) el.classList.add("active");
  document.querySelectorAll(".sidebar li").forEach(function(li) { li.classList.remove("active"); });
  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ================= THEME ================= */

function toggleTheme(isLight) {
  if (isLight === undefined) {
    isLight = document.body.classList.contains("dark-mode");
  }
  document.body.classList.toggle("dark-mode", !isLight);
  document.body.classList.remove("light-mode");

  var switches = document.querySelectorAll('.theme-switch input[type="checkbox"]');
  switches.forEach(function(sw) { sw.checked = isLight; });

  var icon  = document.getElementById("themeModeIcon");
  var lbl   = document.getElementById("themeModeLabel");
  if (icon) icon.textContent = isLight ? "☀️" : "🌙";
  if (lbl)  lbl.textContent  = isLight ? "Light" : "Dark";

  try { localStorage.setItem("ig-theme", isLight ? "light" : "dark"); } catch(e) {}
}


/* ================= LOGOUT ================= */

async function logout() {
  try {
    /* Save data first before clearing session */
    if (typeof saveUserData === "function" && window.__igLoggedIn) {
      try { await saveUserData(); } catch(e) {}
    }
    /* Sign out from Supabase */
    var client = window.supabaseClient || (window.supabase && window.supabase.createClient ? null : window._supabase);
    if (client && client.auth) {
      await client.auth.signOut();
    }
  } catch(e) {
    console.warn("[logout] error:", e.message);
  }
  /* Always redirect regardless of errors */
  window.location.href = "login.html";
}


/* ================= BIND GLOBALS ================= */

function bindGlobalFunctions() {
  window.addData              = addData;
  window.setCurrency          = setCurrency;
  window.showSection          = showSection;
  window.logout               = logout;
  window.askImpactGridAI      = askImpactGridAI;
  window.fillAIChat           = fillAIChat;
  window.toggleTheme          = toggleTheme;
  window.toggleSidebar        = toggleSidebar;
  window.generatePDF          = generatePDF;
  window.generateAIProjection = generateAIProjection;
  window.checkDuplicate       = checkDuplicate;
  window.handleFileImport     = handleFileImport;
  window.openEditModal        = openEditModal;
  window.closeEditModal       = closeEditModal;
  window.saveEdit             = saveEdit;
  window.deleteRecord         = deleteRecord;
  window.toggleMobileMenu     = toggleMobileMenu;
  window.closeMobileMenu      = closeMobileMenu;
  window.mobileNav            = mobileNav;
  window.closeUpgradeModal    = closeUpgradeModal;
  window.toggleRecordsPanel   = toggleRecordsPanel;
  window.openRecordsPanel     = openRecordsPanel;
  window.closeRecordsPanel    = closeRecordsPanel;
  window.renderRecordsPanel   = renderRecordsPanel;
  window.showUpgradePrompt    = showUpgradePrompt;
  window.closeLimitModal      = closeLimitModal;
  window.handlePDFClick       = handlePDFClick;
  window.downloadSavedPDF     = downloadSavedPDF;
  window.updateMatrixSection  = updateMatrixSection;
  window.updateRiskSection    = updateRiskSection;
  window.refreshDijoRiskInsight = refreshDijoRiskInsight;
}

function closeUpgradeModal() {
  var modal = document.getElementById("upgradeModal");
  if (modal) modal.style.display = "none";
}


/* ================= RECORDS PANEL ================= */

function toggleRecordsPanel() {
  var panel = document.getElementById("recordsPanel");
  if (!panel) return;
  panel.classList.contains("open") ? closeRecordsPanel() : openRecordsPanel();
}

function openRecordsPanel() {
  var panel   = document.getElementById("recordsPanel");
  var overlay = document.getElementById("recordsPanelOverlay");
  if (!panel) return;
  renderRecordsPanel();
  panel.classList.add("open");
  if (overlay) overlay.style.display = "block";
  document.body.style.overflow = "hidden";
  var nav = document.getElementById("navRecords");
  if (nav) nav.classList.add("active");
}

function closeRecordsPanel() {
  var panel   = document.getElementById("recordsPanel");
  var overlay = document.getElementById("recordsPanelOverlay");
  if (panel)   panel.classList.remove("open");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
  var nav = document.getElementById("navRecords");
  if (nav) nav.classList.remove("active");
}

function renderRecordsPanel() {
  var tbody  = document.getElementById("rpBody");
  var tfoot  = document.getElementById("rpTotals");
  var sub    = document.getElementById("rpSub");
  var sync   = document.getElementById("rpSyncLabel");
  var dot    = document.querySelector(".rp-dot");

  if (!tbody) return;

  var data  = window.businessData || businessData || [];
  var count = data.length;

  if (sub)  sub.textContent  = count + " month" + (count !== 1 ? "s" : "") + " · click any cell to edit";
  if (sync) sync.textContent = window.currentUser ? "Synced — " + (window.currentUser.email || "") : "Not signed in";
  if (dot)  dot.className    = "rp-dot " + (window.currentUser ? "synced" : "offline");

  if (count === 0) {
    tbody.innerHTML = '<tr class="rp-empty-row"><td colspan="6" class="rp-empty-cell">No records yet.<br><span style="font-size:10px;opacity:0.6;">Add a month on the dashboard to get started.</span></td></tr>';
    if (tfoot) tfoot.innerHTML = "";
    return;
  }

  var sorted = data.slice().sort(function(a,b){ return a.date - b.date; });

  var html = "";
  sorted.forEach(function(record, i) {
    var origIdx  = data.indexOf(record);
    var monthStr = record.date.toISOString().slice(0, 7);
    var margin   = record.revenue > 0 ? ((record.profit / record.revenue) * 100).toFixed(1) : "0.0";
    var profitCls = record.profit >= 0 ? "rp-pos" : "rp-neg";

    var trendHtml = "";
    if (i > 0) {
      var prev = sorted[i - 1];
      if (record.revenue > prev.revenue)      trendHtml = '<span class="rp-arrow rp-up">▲</span>';
      else if (record.revenue < prev.revenue) trendHtml = '<span class="rp-arrow rp-dn">▼</span>';
    }

    html +=
      '<tr class="rp-data-row" data-idx="' + origIdx + '">' +
        '<td class="rp-cell rp-cell-month"><span class="rp-disp">' + monthStr + trendHtml + '</span></td>' +
        '<td class="rp-cell rp-cell-edit" data-field="revenue" data-idx="' + origIdx + '">' +
          '<span class="rp-disp rp-rev">' + formatCurrency(record.revenue) + '</span>' +
          '<input class="rp-inp" type="number" step="0.01" value="' + record.revenue.toFixed(2) + '">' +
        '</td>' +
        '<td class="rp-cell rp-cell-edit" data-field="expenses" data-idx="' + origIdx + '">' +
          '<span class="rp-disp rp-exp">' + formatCurrency(record.expenses) + '</span>' +
          '<input class="rp-inp" type="number" step="0.01" value="' + record.expenses.toFixed(2) + '">' +
        '</td>' +
        '<td class="rp-cell rp-cell-profit"><span class="rp-disp ' + profitCls + '">' + formatCurrency(record.profit) + '</span></td>' +
        '<td class="rp-cell rp-cell-pct"><span class="rp-disp rp-muted">' + margin + '%</span></td>' +
        '<td class="rp-cell rp-cell-del"><button class="rp-del" data-idx="' + origIdx + '" title="Delete">✕</button></td>' +
      '</tr>';
  });

  tbody.innerHTML = html;

  var totalRev = data.reduce(function(s,d){ return s + d.revenue; }, 0);
  var totalExp = data.reduce(function(s,d){ return s + d.expenses; }, 0);
  var totalPro = data.reduce(function(s,d){ return s + d.profit; }, 0);
  var avgMargin = totalRev > 0 ? ((totalPro / totalRev) * 100).toFixed(1) : "0.0";
  var totCls = totalPro >= 0 ? "rp-pos" : "rp-neg";

  if (tfoot) {
    tfoot.innerHTML =
      '<tr class="rp-totals-row">' +
        '<td class="rp-cell rp-cell-month"><span class="rp-disp" style="font-weight:700;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);">TOTAL</span></td>' +
        '<td class="rp-cell"><span class="rp-disp rp-rev" style="font-weight:700;">' + formatCurrency(totalRev) + '</span></td>' +
        '<td class="rp-cell"><span class="rp-disp rp-exp" style="font-weight:700;">' + formatCurrency(totalExp) + '</span></td>' +
        '<td class="rp-cell"><span class="rp-disp ' + totCls + '" style="font-weight:700;">' + formatCurrency(totalPro) + '</span></td>' +
        '<td class="rp-cell"><span class="rp-disp rp-muted" style="font-weight:700;">' + avgMargin + '%</span></td>' +
        '<td class="rp-cell"></td>' +
      '</tr>';
  }

  tbody.querySelectorAll(".rp-cell-edit").forEach(function(cell) {
    var disp  = cell.querySelector(".rp-disp");
    var inp   = cell.querySelector(".rp-inp");
    var field = cell.getAttribute("data-field");
    var idx   = parseInt(cell.getAttribute("data-idx"), 10);

    disp.addEventListener("click", function() {
      cell.classList.add("rp-editing");
      inp.focus(); inp.select();
    });

    function commitEdit() {
      var raw = parseFloat(inp.value);
      if (isNaN(raw) || raw < 0) raw = 0;
      cell.classList.remove("rp-editing");
      var record = data[idx];
      if (!record) return;
      record[field] = raw;
      record.profit = record.revenue - record.expenses;
      renderRecordsPanel();
      if (typeof updateAll === "function") updateAll();
      if (typeof saveUserData === "function") saveUserData();
      var dot2 = document.querySelector(".rp-dot");
      if (dot2) { dot2.className = "rp-dot saving"; setTimeout(function(){ dot2.className = "rp-dot synced"; }, 1200); }
    }

    inp.addEventListener("blur", commitEdit);
    inp.addEventListener("keydown", function(e) {
      if (e.key === "Enter")  { inp.blur(); }
      if (e.key === "Escape") { cell.classList.remove("rp-editing"); }
      if (e.key === "Tab") {
        e.preventDefault();
        var all = Array.from(tbody.querySelectorAll(".rp-cell-edit"));
        var pos = all.indexOf(cell);
        var nxt = all[e.shiftKey ? pos - 1 : pos + 1];
        if (nxt) { inp.blur(); nxt.querySelector(".rp-disp").click(); }
      }
    });
  });

  tbody.querySelectorAll(".rp-del").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      data.splice(idx, 1);
      renderRecordsPanel();
      if (typeof updateAll === "function") updateAll();
      if (typeof saveUserData === "function") saveUserData();
    });
  });
}


/* ================================================================
   PERFORMANCE MATRIX ENGINE
   Called directly from updateAll() — no wrapping needed
================================================================ */

function updateMatrixSection() {
  var data     = window.businessData || [];
  var currency = window.currentCurrency || 'GBP';
  if (data.length < 1) return;

  var sym = {GBP:'£',USD:'$',EUR:'€',NGN:'₦'}[currency] || currency+' ';
  function fc(v) {
    try { return new Intl.NumberFormat(undefined,{style:'currency',currency:currency,maximumFractionDigits:0}).format(v); }
    catch(e){ return sym + Math.round(v).toLocaleString(); }
  }

  var totalRev  = data.reduce(function(s,d){return s+(d.revenue||0);},0);
  var totalExp  = data.reduce(function(s,d){return s+(d.expenses||0);},0);
  var totalProf = data.reduce(function(s,d){return s+(d.profit||0);},0);
  var n         = data.length;
  var avgRev    = totalRev / n;
  var margin    = totalRev > 0 ? (totalProf/totalRev*100) : 0;
  var expRatio  = totalRev > 0 ? (totalExp/totalRev*100) : 0;

  var growthRates = [];
  for (var i=1;i<n;i++) {
    if (data[i-1].revenue>0) growthRates.push((data[i].revenue-data[i-1].revenue)/data[i-1].revenue*100);
  }
  var avgGrowth = growthRates.length>0 ? growthRates.reduce(function(a,b){return a+b;},0)/growthRates.length : 0;

  var revs   = data.map(function(d){return d.revenue;});
  var mean   = totalRev/n;
  var stdDev = Math.sqrt(revs.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/n);
  var volatility = mean>0 ? (stdDev/mean*100) : 0;

  var overallGrowth = data[0].revenue>0 ? (data[n-1].revenue-data[0].revenue)/data[0].revenue*100 : 0;

  function setKPI(id,val) { var el=document.getElementById(id); if(el) el.textContent=val; }
  function setTrend(id,val,isReverse) {
    var el = document.getElementById(id);
    if (!el) return;
    var good = isReverse ? val<0 : val>0;
    var cls  = Math.abs(val)<0.5 ? 'flat' : good ? 'up' : 'down';
    el.className = 'kpi-trend ' + cls;
    el.textContent = (val>=0?'+':'')+val.toFixed(1)+'%';
  }

  setKPI('kpiRevenue', fc(totalRev));
  setKPI('kpiProfit',  fc(totalProf));
  setKPI('kpiMargin',  margin.toFixed(1)+'%');
  setKPI('kpiAvgRev',  fc(avgRev));
  setKPI('kpiExpRatio', expRatio.toFixed(1)+'%');
  setKPI('kpiGrowth',  avgGrowth.toFixed(1)+'%');

  setTrend('kpiRevTrend',    overallGrowth,  false);
  setTrend('kpiProfTrend',   overallGrowth,  false);
  setTrend('kpiMarginTrend', margin-15,       false);
  setTrend('kpiExpTrend',    expRatio-80,     true);
  setTrend('kpiGrowthTrend', avgGrowth,       false);

  if (n >= 3) {
    var score = 0;
    score += Math.min(30, Math.max(0, margin * 1.2));
    score += Math.min(25, Math.max(0, avgGrowth * 3));
    score += Math.min(25, Math.max(0, 25 - volatility*0.5));
    score += Math.min(20, Math.max(0, (100-expRatio)*0.5));
    score = Math.min(100, Math.max(0, Math.round(score)));

    var color = score>=70 ? '#2dd4a0' : score>=45 ? '#c8a96e' : '#ff4d6d';
    var healthLabel = score>=70 ? 'Strong' : score>=45 ? 'Moderate' : 'Under Pressure';

    var fill = document.getElementById('gaugeFill');
    if (fill) {
      var offset = 204 - (score/100 * 204);
      setTimeout(function(){ fill.style.strokeDashoffset = offset; fill.style.stroke = color; }, 100);
    }
    var gNum = document.getElementById('gaugeNumber');
    if (gNum) { gNum.textContent = score; gNum.style.color = color; }
    var gTitle = document.getElementById('gaugeTitle');
    if (gTitle) gTitle.textContent = 'Business Health: ' + healthLabel;
    var gSub = document.getElementById('gaugeSub');
    if (gSub) gSub.textContent = score>=70
      ? 'Your business is financially healthy. Revenue is stable, margins are solid, and costs are well-controlled.'
      : score>=45
      ? 'Your business is performing moderately. There are specific areas to improve — see the breakdown below.'
      : 'Your business is under financial pressure. Focus on the highest-priority items in the breakdown.';

    var bars = document.getElementById('gaugeBars');
    if (bars) {
      var components = [
        { label:'Margin',     score: Math.min(100,Math.max(0,margin*5)),         color:'#2dd4a0' },
        { label:'Growth',     score: Math.min(100,Math.max(0,50+avgGrowth*5)),   color:'#7eb3ff' },
        { label:'Stability',  score: Math.min(100,Math.max(0,100-volatility*1.5)),color:'#c8a96e' },
        { label:'Cost Ctrl',  score: Math.min(100,Math.max(0,(100-expRatio)*1.5)),color:'#ff9f43' },
      ];
      bars.innerHTML = components.map(function(c){
        return '<div class="gauge-bar-row">'
          + '<span class="gauge-bar-label">' + c.label + '</span>'
          + '<div class="gauge-bar-track"><div class="gauge-bar-fill" style="width:'+Math.round(c.score)+'%;background:'+c.color+';"></div></div>'
          + '<span class="gauge-bar-val">' + Math.round(c.score) + '</span>'
          + '</div>';
      }).join('');
    }
  }

  var tbody = document.getElementById('benchmarkTableBody');
  if (tbody && n>=2) {
    var rows = [
      { metric:'Profit Margin',  yours:margin.toFixed(1)+'%',    bench:'10–15%', good: margin>=10,   warn: margin>=6 },
      { metric:'Expense Ratio',  yours:expRatio.toFixed(1)+'%',  bench:'75–82%', good: expRatio<=82, warn: expRatio<=88 },
      { metric:'Monthly Growth', yours:avgGrowth.toFixed(1)+'%', bench:'2–5%',   good: avgGrowth>=2, warn: avgGrowth>=0 },
      { metric:'Revenue Vol.',   yours:volatility.toFixed(1)+'%',bench:'< 20%',  good: volatility<20,warn: volatility<35 },
    ];
    tbody.innerHTML = rows.map(function(r){
      var cls  = r.good ? 'bm-good' : r.warn ? 'bm-warn' : 'bm-bad';
      var stat = r.good ? '✓ On track' : r.warn ? '~ Improving' : '✗ Needs work';
      return '<tr><td style="color:var(--text-primary,#0f1629);font-weight:600;">'+r.metric+'</td>'
        + '<td style="color:var(--text-primary,#0f1629);">'+r.yours+'</td>'
        + '<td>'+r.bench+'</td>'
        + '<td><span class="bm-pill '+cls+'">'+stat+'</span></td></tr>';
    }).join('');
  }
}


/* ================================================================
   RISK SECTION ENGINE
   Called directly from updateAll() — no wrapping needed
================================================================ */

var _riskRadarChart = null;

function updateRiskSection() {
  var data     = window.businessData || [];
  var currency = window.currentCurrency || 'GBP';
  if (data.length < 2) return;

  var n        = data.length;
  var totalRev = data.reduce(function(s,d){return s+(d.revenue||0);},0);
  var totalExp = data.reduce(function(s,d){return s+(d.expenses||0);},0);
  var totalProf= data.reduce(function(s,d){return s+(d.profit||0);},0);
  var avgRev   = totalRev/n;
  var margin   = totalRev>0 ? totalProf/totalRev*100 : 0;
  var expRatio = totalRev>0 ? totalExp/totalRev*100 : 0;

  var revs   = data.map(function(d){return d.revenue;});
  var mean   = totalRev/n;
  var stdDev = Math.sqrt(revs.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/n);
  var volatility = mean>0 ? stdDev/mean*100 : 0;

  var growthRates = [];
  for(var i=1;i<n;i++) {
    if(data[i-1].revenue>0) growthRates.push((data[i].revenue-data[i-1].revenue)/data[i-1].revenue*100);
  }
  var avgGrowth = growthRates.length>0 ? growthRates.reduce(function(a,b){return a+b;},0)/growthRates.length : 0;

  var stabLevel = volatility<15?'Low':volatility<30?'Moderate':volatility<50?'Elevated':'High';
  var stabScore = Math.max(0,Math.min(100, 100-volatility*1.5));
  _setRiskCard('stability', stabLevel, stabScore,
    volatility<15 ? 'Revenue is highly consistent month to month'
    : volatility<30 ? 'Some variation — consider recurring revenue streams'
    : 'High revenue swings — focus on predictable income sources');

  var margLevel = margin>20?'Low':margin>10?'Moderate':margin>5?'Elevated':'High';
  var margScore = Math.max(0,Math.min(100, margin*4));
  _setRiskCard('margin', margLevel, margScore,
    margin>20 ? 'Strong margins — good buffer against shocks'
    : margin>10 ? 'Acceptable — aim for 20%+ for resilience'
    : margin>5 ? 'Thin margins — vulnerable to cost increases'
    : 'Very low margins — urgent improvement needed');

  var avgProf   = totalProf/n;
  var liqLevel  = avgProf>avgRev*0.15?'Low':avgProf>0?'Moderate':avgProf>-avgRev*0.1?'Elevated':'High';
  var liqScore  = Math.max(0,Math.min(100, 50 + (avgProf/avgRev)*200));
  _setRiskCard('liquidity', liqLevel, liqScore,
    avgProf>avgRev*0.15 ? 'Healthy cash generation — positive monthly flow'
    : avgProf>0 ? 'Cash-flow positive but slim — build a reserve'
    : 'Cash-flow negative — expenses exceeding revenue');

  var growthLevel = avgGrowth>3?'Low':avgGrowth>0?'Moderate':avgGrowth>-3?'Elevated':'High';
  var growthScore = Math.max(0,Math.min(100, 50+avgGrowth*8));
  _setRiskCard('growthRisk', growthLevel, growthScore,
    avgGrowth>3 ? 'Strong growth momentum — sustain it'
    : avgGrowth>0 ? 'Slow but positive — accelerate acquisition'
    : 'Declining revenue — diagnose the cause urgently');

  _updateRiskRadar([stabScore, margScore, liqScore, growthScore, Math.max(0,100-expRatio*0.8)]);

  if (n>=3) _generateDijoRiskInsight(data, margin, volatility, avgGrowth, expRatio, currency);
}

function _setRiskCard(prefix, level, score, desc) {
  var color = level==='Low'?'#2dd4a0':level==='Moderate'?'#c8a96e':level==='Elevated'?'#ff9f43':'#ff4d6d';
  var icon  = level==='Low'?'✅':level==='Moderate'?'⚠️':level==='Elevated'?'🔶':'🚨';

  var valEl = document.getElementById(prefix+'Risk');
  var descEl= document.getElementById(prefix+'Desc');
  var accEl = document.getElementById(prefix+'Accent');
  var iconEl= document.getElementById(prefix+'Icon');
  var metEl = document.getElementById(prefix+'Meter');

  if(valEl)  { valEl.textContent = level+' Risk'; valEl.style.color = color; }
  if(descEl)  descEl.textContent = desc;
  if(accEl)   accEl.style.background = color;
  if(iconEl) { iconEl.textContent = icon; iconEl.style.background = 'rgba('+_hexToRgb(color)+',0.12)'; }
  if(metEl)  { metEl.style.width = Math.round(score)+'%'; metEl.style.background = color; }
}

function _hexToRgb(hex) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}

function _updateRiskRadar(scores) {
  var canvas = document.getElementById('riskRadarChart');
  if (!canvas) return;
  if (_riskRadarChart) { _riskRadarChart.destroy(); _riskRadarChart = null; }
  _riskRadarChart = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: ['Stability','Margin','Cash Flow','Growth','Cost Control'],
      datasets: [{
        label: 'Your Business',
        data: scores.map(function(s){ return Math.round(s); }),
        backgroundColor: 'rgba(200,169,110,0.12)',
        borderColor: 'rgba(200,169,110,0.6)',
        borderWidth: 2,
        pointBackgroundColor: '#c8a96e',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          min:0, max:100,
          ticks: { display:false },
          grid: { color:'rgba(255,255,255,0.06)' },
          angleLines: { color:'rgba(255,255,255,0.06)' },
          pointLabels: {
            font: { family:"'JetBrains Mono',monospace", size:10 },
            color: 'rgba(160,176,204,0.8)'
          }
        }
      },
      plugins: { legend: { display:false } }
    }
  });
}

function _generateDijoRiskInsight(data, margin, volatility, avgGrowth, expRatio, currency) {
  var el     = document.getElementById('riskInsight');
  var chips  = document.getElementById('riskInsightChips');
  var status = document.getElementById('dijoRiskStatus');
  if (!el) return;

  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:rgba(160,176,204,0.5);">'
    + '<div style="display:flex;gap:4px;">'
    + '<div style="width:6px;height:6px;border-radius:50%;background:#c8a96e;animation:dijoTyping 1.2s ease-in-out infinite;"></div>'
    + '<div style="width:6px;height:6px;border-radius:50%;background:#c8a96e;animation:dijoTyping 1.2s ease-in-out 0.2s infinite;"></div>'
    + '<div style="width:6px;height:6px;border-radius:50%;background:#c8a96e;animation:dijoTyping 1.2s ease-in-out 0.4s infinite;"></div>'
    + '</div><span style="font-size:12px;">Analysing your risk profile…</span></div>';

  setTimeout(function() {
    try {
      var fin     = ImpactGridAI.buildFinancials(data, currency);
      var insight = ImpactGridAI.riskAnalysis(fin, currency);
      insight = insight.replace(/<div class='ai-suggestions'>[\s\S]*?<\/div>/, '');
      el.innerHTML = insight;
    } catch(e) {
      var lines = [];
      if (volatility > 30) lines.push('<strong>⚠ High Volatility:</strong> Revenue swings by ' + volatility.toFixed(0) + '% — unpredictable cash flow makes planning difficult.');
      if (margin < 10)     lines.push('<strong>⚠ Thin Margins:</strong> At ' + margin.toFixed(1) + '% profit margin, one bad month could push you into loss.');
      if (expRatio > 85)   lines.push('<strong>⚠ High Costs:</strong> ' + expRatio.toFixed(0) + 'p of every £1 earned goes on expenses. The SME benchmark is 75–80%.');
      if (avgGrowth < 0)   lines.push('<strong>⚠ Declining Revenue:</strong> Revenue has been trending downward — this needs diagnosis before it compounds.');
      if (lines.length === 0) lines.push('<strong>✓ No Critical Risks:</strong> Your business shows no major red flags. Maintain financial discipline and build a 3-month expense reserve.');
      el.innerHTML = '<p>' + lines.join('</p><p>') + '</p>';
    }
    if (chips)  chips.style.display = 'flex';
    if (status) status.textContent  = 'Generated ' + new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  }, 900);
}

function refreshDijoRiskInsight() {
  var data = window.businessData || [];
  if (data.length < 3) return;
  var currency  = window.currentCurrency || 'GBP';
  var totalRev  = data.reduce(function(s,d){return s+(d.revenue||0);},0);
  var totalProf = data.reduce(function(s,d){return s+(d.profit||0);},0);
  var totalExp  = data.reduce(function(s,d){return s+(d.expenses||0);},0);
  var n         = data.length;
  var margin    = totalRev>0 ? totalProf/totalRev*100 : 0;
  var expRatio  = totalRev>0 ? totalExp/totalRev*100 : 0;
  var revs      = data.map(function(d){return d.revenue;});
  var mean      = totalRev/n;
  var stdDev    = Math.sqrt(revs.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/n);
  var volatility= mean>0 ? stdDev/mean*100 : 0;
  var growthRates=[];
  for(var i=1;i<n;i++) if(data[i-1].revenue>0) growthRates.push((data[i].revenue-data[i-1].revenue)/data[i-1].revenue*100);
  var avgGrowth = growthRates.length>0 ? growthRates.reduce(function(a,b){return a+b;},0)/growthRates.length : 0;
  _generateDijoRiskInsight(data, margin, volatility, avgGrowth, expRatio, currency);
}

/* All functions defined — bind globals for inline onclick handlers */
bindGlobalFunctions();
