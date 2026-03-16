/* ================================================================
   IMPACTGRID — RECORDS PANEL v2.1
   Spreadsheet-style sidebar panel.
   Data persists in Supabase per user.

   RETENTION RULE:
   - window.businessData is NEVER trimmed here — it is the live source
     of truth for all analysis, charts, AI, and forecasts.
   - The panel DISPLAYS all records the user has entered.
   - On save, the payload sent to Supabase is trimmed to the plan limit
     so only the allowed months are stored server-side.
   - This means a Basic user can enter 3 months, run full analysis,
     then only records within the plan's day window are persisted on save.
   Basic: 7 days · Professional: 180 days · Enterprise: unlimited
================================================================ */

/* ── Plan retention limits (for save trimming only) ── */
const DATA_RETENTION_DAYS = {
  basic:         7,
  professional:  365,
  enterprise:   Infinity,
  admin:        Infinity
};

/* ── Main render — reads window.businessData without mutating it ── */
function renderRecordsPanel() {
  const panel = document.getElementById('recordsPanel');
  if (!panel) return;

  /* Read full live data — never modify it */
  const allData  = (window.businessData || []).slice().sort((a,b) => new Date(b.date)-new Date(a.date));
  const plan     = window.currentPlan || 'basic';
  const maxMo    = DATA_RETENTION_DAYS[plan] ?? 7;
  const currency = window.currentCurrency || 'GBP';
  const sym      = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'NGN' ? '₦' : '£';

  /* Show all entered records in the panel regardless of plan */
  const data = allData;

  /* totals across all displayed records */
  const totRev  = data.reduce((s,d) => s + (d.revenue  ||0), 0);
  const totExp  = data.reduce((s,d) => s + (d.expenses ||0), 0);
  const totProf = data.reduce((s,d) => s + (d.profit   ||0), 0);

  const retLabel = maxMo === Infinity
    ? 'Unlimited storage'
    : maxMo >= 30
      ? `${Math.round(maxMo/30)} month${Math.round(maxMo/30)>1?'s':''} storage`
      : `${maxMo} day${maxMo!==1?'s':''} storage`;

  const planColor = {
    basic:         'var(--text-muted)',
    professional: 'var(--gold)',
    enterprise:   'var(--blue)',
    admin:        'var(--success)'
  }[plan] || 'var(--text-muted)';

  /* ── Build spreadsheet rows ── */
  let rowsHTML = '';
  if (!data.length) {
    rowsHTML = `
      <tr class="rp-empty-row">
        <td colspan="5">
          <div class="rp-empty-cell">No data yet — add your first month below</div>
        </td>
      </tr>`;
  } else {
    data.forEach((d, i) => {
      const prev    = data[i + 1];
      const date    = new Date(d.date);
      const mo      = date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
      const margin  = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : '0.0';
      const profit  = d.profit || 0;
      const profCls = profit >= 0 ? 'rp-cell-pos' : 'rp-cell-neg';
      const profPfx = profit >= 0 ? '+' : '-';

      let trendHTML = '';
      if (prev) {
        const diff = d.revenue - prev.revenue;
        if      (diff > 0)  trendHTML = `<span class="rp-trend-up">▲</span>`;
        else if (diff < 0)  trendHTML = `<span class="rp-trend-dn">▼</span>`;
        else                trendHTML = `<span class="rp-trend-fl">–</span>`;
      }

      /* Dim records that are beyond the plan retention window */
      /* Use savedAt (when entered) not d.date (reporting month) for retention */
      const enteredAt = new Date(d.savedAt || Date.now());
      const cutoff    = maxMo !== Infinity ? new Date(Date.now() - maxMo * 24*60*60*1000) : null;
      const beyondRetention = cutoff && enteredAt < cutoff;
      const rowStyle = beyondRetention
        ? 'opacity:0.38;position:relative;'
        : '';
      const lockIcon = beyondRetention
        ? `<span title="Beyond ${retLabel} — upgrade to retain" style="margin-left:4px;font-size:9px;color:var(--text-muted);">🔒</span>`
        : '';

      rowsHTML += `
        <tr class="rp-data-row" style="${rowStyle}" onclick="handleRPRowClick(${i})" title="${beyondRetention ? 'Beyond retention — upgrade to keep' : 'Click to edit ' + mo}">
          <td class="rp-cell rp-cell-date">${mo} ${trendHTML}${lockIcon}</td>
          <td class="rp-cell rp-cell-num rp-cell-rev">${sym}${Number(d.revenue||0).toLocaleString()}</td>
          <td class="rp-cell rp-cell-num rp-cell-exp">${sym}${Number(d.expenses||0).toLocaleString()}</td>
          <td class="rp-cell rp-cell-num ${profCls}">${profPfx}${sym}${Math.abs(profit).toLocaleString()}</td>
          <td class="rp-cell rp-cell-num rp-cell-mg">${margin}%</td>
        </tr>`;
    });
  }

  /* ── Totals row ── */
  const totProfCls = totProf >= 0 ? 'rp-cell-pos' : 'rp-cell-neg';
  const totProfPfx = totProf >= 0 ? '+' : '-';
  const totMargin  = totRev > 0 ? ((totProf / totRev) * 100).toFixed(1) : '0.0';

  const totalsRow = data.length ? `
    <tr class="rp-totals-row">
      <td class="rp-cell rp-cell-date rp-totals-label">TOTAL (${data.length}mo)</td>
      <td class="rp-cell rp-cell-num rp-cell-rev">${sym}${totRev.toLocaleString()}</td>
      <td class="rp-cell rp-cell-num rp-cell-exp">${sym}${totExp.toLocaleString()}</td>
      <td class="rp-cell rp-cell-num ${totProfCls}">${totProfPfx}${sym}${Math.abs(totProf).toLocaleString()}</td>
      <td class="rp-cell rp-cell-num rp-cell-mg">${totMargin}%</td>
    </tr>` : '';

  /* ── Retention banner ── */
  const isLimited = maxMo !== Infinity;
  const cutoffDate = maxMo !== Infinity ? new Date(Date.now() - maxMo * 24*60*60*1000) : null;
  const overLimit  = cutoffDate ? data.some(function(d){ return new Date(d.savedAt||Date.now()) < cutoffDate; }) : false;
  const overCount  = cutoffDate ? data.filter(function(d){ return new Date(d.savedAt||Date.now()) < cutoffDate; }).length : 0;

  const retBanner = isLimited
    ? overLimit
      ? `<div class="rp-retention-banner rp-retention-warn">
          <span class="rp-retention-icon">⏱</span>
          <span class="rp-retention-text">
            <strong>${retLabel} storage</strong> on ${plan.charAt(0).toUpperCase()+plan.slice(1)} plan — records saved for ${retLabel} from when you entered them.
            ${overCount} record${overCount > 1 ? 's' : ''} older than ${retLabel} won't be kept after logout.
            <a href="#" onclick="showSection('upgrade');closeRecordsPanel();return false;" class="rp-upgrade-link">Upgrade to keep all →</a>
          </span>
        </div>`
      : `<div class="rp-retention-banner">
          <span class="rp-retention-icon">⏱</span>
          <span class="rp-retention-text">
            <strong>${retLabel} storage</strong> — records saved for ${retLabel} from entry date.
            <a href="#" onclick="showSection('upgrade');closeRecordsPanel();return false;" class="rp-upgrade-link">Upgrade for more →</a>
          </span>
        </div>`
    : `<div class="rp-retention-banner rp-retention-ok">
        <span class="rp-retention-icon">✓</span>
        <span class="rp-retention-text"><strong>${retLabel}</strong> — all your data is always here.</span>
      </div>`;

  panel.innerHTML = `
    <!-- Header -->
    <div class="rp-header">
      <div>
        <div class="rp-title">Financial Records</div>
        <div class="rp-sub">Live spreadsheet · ${data.length} month${data.length!==1?'s':''} of data</div>
      </div>
      <button class="rp-close" onclick="closeRecordsPanel()" title="Close">✕</button>
    </div>

    <!-- Sync status -->
    <div class="rp-status">
      <span class="rp-dot synced"></span>
      <span id="rpSyncLabel" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);">Saved to account</span>
      <span class="rp-plan-chip" style="margin-left:auto;color:${planColor};">${plan.toUpperCase()}</span>
    </div>

    <!-- Retention banner -->
    ${retBanner}

    <!-- Spreadsheet -->
    <div class="rp-sheet-wrap">
      <table class="rp-sheet">
        <thead>
          <tr class="rp-sheet-head">
            <th class="rp-th rp-th-date">MONTH</th>
            <th class="rp-th rp-th-num">REVENUE</th>
            <th class="rp-th rp-th-num">EXPENSES</th>
            <th class="rp-th rp-th-num">PROFIT</th>
            <th class="rp-th rp-th-num">MARGIN</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
          ${totalsRow}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div class="rp-footer">
      <button class="rp-add-btn" onclick="scrollToDataEntry()">+ Add Month</button>
    </div>
  `;
}

/* ── Row click → open edit modal ── */
function handleRPRowClick(reversedIndex) {
  const data   = (window.businessData || []).slice().sort((a,b) => new Date(b.date)-new Date(a.date));
  const record = data[reversedIndex];
  if (!record) return;
  if (typeof openEditModal === 'function') {
    const originalIndex = window.businessData.indexOf(record);
    openEditModal(originalIndex);
  }
}

/* ── Scroll to data entry section ── */
function scrollToDataEntry() {
  closeRecordsPanel();
  const el = document.getElementById('dateInput') || document.getElementById('revenueInput');
  if (el) { el.scrollIntoView({ behavior:'smooth', block:'center' }); el.focus(); }
}

/* ── Panel open/close ── */
function openRecordsPanel()  {
  renderRecordsPanel();
  const p = document.getElementById('recordsPanel');
  const o = document.getElementById('sbOverlay');
  if (p) p.classList.add('open');
  if (o) { o.style.display = 'block'; o.onclick = closeRecordsPanel; }
}

function closeRecordsPanel() {
  const p = document.getElementById('recordsPanel');
  const o = document.getElementById('sbOverlay');
  if (p) p.classList.remove('open');
  if (o) { o.style.display = 'none'; o.onclick = null; }
}

/* Retention trimming is handled inside plans.js saveUserData — no override needed here */

/* Expose globals */
window.renderRecordsPanel   = renderRecordsPanel;
window.openRecordsPanel     = openRecordsPanel;
window.closeRecordsPanel    = closeRecordsPanel;
window.handleRPRowClick     = handleRPRowClick;
window.enforceDataRetention = function() {}; /* no-op — retention is display-only now */
