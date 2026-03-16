/* =====================================================================
   IMPACTGRID AI ENGINE — FINANCIAL ADVISER v3.0
   No API required. Thinks like a real financial adviser.

   What makes this different from v2:
   ✅ Deep financial analysis using real ratios & benchmarks
   ✅ Understands follow-up questions using conversation memory
   ✅ Industry-specific benchmarks (café, retail, consulting etc.)
   ✅ Trend analysis — detects acceleration, deceleration, plateaus
   ✅ Seasonal pattern detection across months
   ✅ Cash flow health scoring (burn rate, runway)
   ✅ Expense ratio analysis — flags cost creep
   ✅ Break-even analysis
   ✅ Month-by-month commentary — knows which month was best/worst
   ✅ Specific, numbered, actionable advice — not generic text
   ✅ Confident adviser tone — no hedging, no vague answers
===================================================================== */

var ImpactGridAI = {

  /* ===================================================================
     MAIN ENTRY — async wrapper kept for script.js compatibility
  =================================================================== */

  analyze: async function(question, data, currency, history) {
    history = history || [];
    // Simulate a brief thinking pause for UX realism
    await new Promise(function(r) { setTimeout(r, 420); });
    return ImpactGridAI.adviser(question, data, currency, history);
  },


  /* ===================================================================
     CORE ADVISER BRAIN
     Routes every question to the right analysis module
  =================================================================== */

  adviser: function(question, data, currency, history) {
    var q = question.toLowerCase().trim();

    if (!data || data.length === 0) return ImpactGridAI.noData();

    // Build full financial picture once — used by all modules
    var fin = ImpactGridAI.buildFinancials(data, currency);

    // Intent routing — order matters (most specific first)
    if (ImpactGridAI.is(q, ["break even","breakeven","break-even"]))
      return ImpactGridAI.breakEvenAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["burn","runway","cash","cashflow","cash flow","how long"]))
      return ImpactGridAI.cashFlowAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["expense","cost","spending","overheads","overhead","outgoing"]))
      return ImpactGridAI.expenseAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["best month","worst month","best period","highest","lowest","peak","which month"]))
      return ImpactGridAI.bestWorstAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["season","seasonal","pattern","time of year","quarter"]))
      return ImpactGridAI.seasonalAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["anomal","unusual","spike","drop","outlier","strange","weird","different"]))
      return ImpactGridAI.anomalyAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["forecast","project","future","predict","next year","in 5","in 3","in 10","years time","year projection","year forecast"]) || /^\d+$/.test(q))
      return ImpactGridAI.forecastAnalysis(q, fin, currency);

    if (ImpactGridAI.is(q, ["risk","stable","stability","volatil","danger","safe","uncertain","consistent","reliable"]))
      return ImpactGridAI.riskAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["benchmark","industry","compare","average","typical","standard","sector"]))
      return ImpactGridAI.benchmarkAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["margin","profit margin","net margin","gross"]))
      return ImpactGridAI.marginAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["grow","growth","increase revenue","scale","expand","more customers","more sales"]))
      return ImpactGridAI.growthStrategy(fin, currency);

    if (ImpactGridAI.is(q, ["cut","reduce","save","saving","cheaper","lower cost","trim","slash"]))
      return ImpactGridAI.costReduction(fin, currency);

    if (ImpactGridAI.is(q, ["performance","health","how am i doing","how are we doing","summary","overview","status","results","report"]))
      return ImpactGridAI.performanceSummary(fin, currency);

    if (ImpactGridAI.is(q, ["strategy","strategic","advice","advise","recommend","should i","what should","help me","plan","next step","what do i do"]))
      return ImpactGridAI.strategicAdvice(fin, currency);

    if (ImpactGridAI.is(q, ["chart","graph","visual","explain","what does","tell me about","breakdown","analyse","analyze"]))
      return ImpactGridAI.chartNarrative(fin, currency);

    if (ImpactGridAI.is(q, ["invest","reinvest","spend","hire","staff","marketing","advertising"]))
      return ImpactGridAI.investmentAdvice(fin, currency);

    if (ImpactGridAI.is(q, ["trend","direction","trajectory","momentum","accelerat","decelerat","slowing","speeding"]))
      return ImpactGridAI.trendAnalysis(fin, currency);

    if (ImpactGridAI.is(q, ["what","why","how","when","where","tell me","explain","describe"]))
      return ImpactGridAI.openQuestion(q, fin, currency, history);

    // Catch-all — still give useful output
    return ImpactGridAI.performanceSummary(fin, currency);
  },


  /* ===================================================================
     FINANCIAL MODEL BUILDER
     Computes every metric once, used across all modules
  =================================================================== */

  buildFinancials: function(data, currency) {
    var totalRev  = ImpactGridAI.sum(data, "revenue");
    var totalExp  = ImpactGridAI.sum(data, "expenses");
    var totalProf = ImpactGridAI.sum(data, "profit");
    var n         = data.length;

    var avgRev    = totalRev  / n;
    var avgExp    = totalExp  / n;
    var avgProf   = totalProf / n;

    var margin    = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;
    var expRatio  = totalRev > 0 ? (totalExp  / totalRev) * 100 : 0;

    // Month-by-month growth rates
    var growthRates = [];
    for (var i = 1; i < n; i++) {
      if (data[i-1].revenue > 0)
        growthRates.push((data[i].revenue - data[i-1].revenue) / data[i-1].revenue * 100);
    }

    var avgGrowth = growthRates.length > 0
      ? growthRates.reduce(function(a,b){return a+b;},0) / growthRates.length : 0;

    // Trend acceleration: is growth speeding up or slowing down?
    var trendAccel = 0;
    if (growthRates.length >= 4) {
      var half = Math.floor(growthRates.length / 2);
      var earlyAvg = growthRates.slice(0, half).reduce(function(a,b){return a+b;},0)/half;
      var lateAvg  = growthRates.slice(-half).reduce(function(a,b){return a+b;},0)/half;
      trendAccel   = lateAvg - earlyAvg;
    }

    // Volatility (coefficient of variation)
    var revs   = data.map(function(d){return d.revenue;});
    var mean   = totalRev / n;
    var stdDev = Math.sqrt(revs.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/n);
    var volatility = mean > 0 ? (stdDev / mean) * 100 : 0;

    // Overall growth first to last
    var overallGrowth = data[0].revenue > 0
      ? (data[n-1].revenue - data[0].revenue) / data[0].revenue * 100 : 0;

    // Best and worst months
    var bestMonth  = data.reduce(function(a,b){return b.revenue > a.revenue ? b : a;});
    var worstMonth = data.reduce(function(a,b){return b.revenue < a.revenue ? b : a;});
    var bestProfit = data.reduce(function(a,b){return b.profit > a.profit ? b : a;});
    var worstProfit= data.reduce(function(a,b){return b.profit < a.profit ? b : a;});

    // Expense creep: is expense ratio rising over time?
    var expCreep = 0;
    if (n >= 4) {
      var earlyExpRatio = data.slice(0, Math.floor(n/2)).reduce(function(s,d){return s + (d.expenses/d.revenue);},0) / Math.floor(n/2) * 100;
      var lateExpRatio  = data.slice(-Math.floor(n/2)).reduce(function(s,d){return s + (d.expenses/d.revenue);},0) / Math.floor(n/2) * 100;
      expCreep = lateExpRatio - earlyExpRatio;
    }

    // Anomalies
    var anomalies = ImpactGridAI.detectAnomalies(data);

    // Consecutive growth/decline streaks
    var currentStreak = 0;
    var streakType = "flat";
    if (n >= 2) {
      currentStreak = 1;
      streakType = data[n-1].revenue > data[n-2].revenue ? "growth" : "decline";
      for (var j = n-2; j > 0; j--) {
        if (streakType === "growth" && data[j].revenue > data[j-1].revenue) currentStreak++;
        else if (streakType === "decline" && data[j].revenue < data[j-1].revenue) currentStreak++;
        else break;
      }
    }

    // Break-even point (monthly fixed cost approximation)
    var fixedCostEst = avgExp * 0.6; // rough: ~60% of expenses are fixed
    var varCostRatio = (avgExp * 0.4) / (avgRev || 1);
    var breakEven    = varCostRatio < 1 ? fixedCostEst / (1 - varCostRatio) : 0;

    // Profitability trend
    var profMargins = data.map(function(d){ return d.revenue > 0 ? d.profit/d.revenue*100 : 0; });
    var marginTrend = profMargins.length >= 3
      ? profMargins[profMargins.length-1] - profMargins[0] : 0;

    return {
      data: data,
      n: n,
      totalRev: totalRev,
      totalExp: totalExp,
      totalProf: totalProf,
      avgRev: avgRev,
      avgExp: avgExp,
      avgProf: avgProf,
      margin: margin,
      expRatio: expRatio,
      avgGrowth: avgGrowth,
      overallGrowth: overallGrowth,
      growthRates: growthRates,
      trendAccel: trendAccel,
      volatility: volatility,
      stdDev: stdDev,
      bestMonth: bestMonth,
      worstMonth: worstMonth,
      bestProfit: bestProfit,
      worstProfit: worstProfit,
      expCreep: expCreep,
      anomalies: anomalies,
      currentStreak: currentStreak,
      streakType: streakType,
      breakEven: breakEven,
      profMargins: profMargins,
      marginTrend: marginTrend,
      currency: currency
    };
  },


  /* ===================================================================
     1. PERFORMANCE SUMMARY — full adviser briefing
  =================================================================== */

  performanceSummary: function(fin, currency) {
    var f  = ImpactGridAI.fc;
    var c  = currency;

    var healthScore = ImpactGridAI.calcHealthScore(fin);
    var healthLabel = healthScore >= 70 ? "Strong" : healthScore >= 45 ? "Moderate" : "Under Pressure";
    var healthColor = healthScore >= 70 ? "#2dd4a0" : healthScore >= 45 ? "#c8a96e" : "#ff4d6d";

    var trendWord = fin.avgGrowth > 3 ? "growing strongly"
      : fin.avgGrowth > 0 ? "growing steadily"
      : fin.avgGrowth > -3 ? "flat"
      : "declining";

    var marginVerdict = fin.margin > 20 ? "excellent — well above the SME average of 10–15%"
      : fin.margin > 15 ? "good — above the typical SME benchmark"
      : fin.margin > 10 ? "acceptable — in line with the SME average"
      : fin.margin > 5  ? "below average — there is room to improve"
      : "low — this needs immediate attention";

    var streakNote = fin.currentStreak >= 2
      ? " You are currently on a <strong>" + fin.currentStreak + "-month " + fin.streakType + " streak</strong>."
      : "";

    var expNote = fin.expCreep > 5
      ? "<br><br><strong style='color:#f5a623;'>⚠ Cost Creep Detected:</strong> Your expense ratio has risen by <strong>" + fin.expCreep.toFixed(1) + " percentage points</strong> in recent months. Costs are growing faster than revenue — this needs addressing before it erodes your margin further."
      : fin.expCreep < -3
        ? "<br><br><strong style='color:#2dd4a0;'>✓ Cost Efficiency Improving:</strong> Your expense ratio has improved by <strong>" + Math.abs(fin.expCreep).toFixed(1) + " percentage points</strong> recently — good cost discipline."
        : "";

    var anomalyNote = fin.anomalies.length > 0
      ? "<br><br><strong style='color:#f5a623;'>⚠ Anomalies:</strong> " + fin.anomalies.map(function(a){ return a.date.toISOString().slice(0,7); }).join(", ") + " showed unusual revenue — worth investigating."
      : "";

    return ImpactGridAI.card("Financial Performance Summary",
      "<div style='display:inline-block;padding:6px 14px;background:" + healthColor + "22;border:1px solid " + healthColor + "44;border-radius:20px;font-size:12px;color:" + healthColor + ";font-weight:700;margin-bottom:14px;'>Business Health: " + healthLabel + " (" + healthScore + "/100)</div>" +

      "<p>Over <strong>" + fin.n + " months</strong>, your business has generated <strong>" + f(fin.totalRev, c) + "</strong> in total revenue with a net profit of <strong>" + f(fin.totalProf, c) + "</strong>. Revenue is " + trendWord + " at an average of <strong>" + fin.avgGrowth.toFixed(1) + "% per month</strong>." + streakNote + "</p>" +

      "<p>Your profit margin of <strong>" + fin.margin.toFixed(1) + "%</strong> is " + marginVerdict + ". Monthly revenue averages <strong>" + f(fin.avgRev, c) + "</strong> against average expenses of <strong>" + f(fin.avgExp, c) + "</strong>.</p>" +

      expNote + anomalyNote,

      ["How can I improve my margin?", "What are my biggest risks?", "3 year forecast"]
    );
  },


  /* ===================================================================
     2. MARGIN ANALYSIS — deep dive into profitability
  =================================================================== */

  marginAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var best  = Math.max.apply(null, fin.profMargins);
    var worst = Math.min.apply(null, fin.profMargins);
    var trend = fin.marginTrend > 2 ? "improving" : fin.marginTrend < -2 ? "deteriorating" : "stable";

    var advice = [];
    if (fin.margin < 10) {
      advice.push("Your margin of <strong>" + fin.margin.toFixed(1) + "%</strong> is below the SME benchmark of 10–15%. Every " + f(1000, fin.currency).replace(/[\d,]/g,"") + "1,000 in revenue only keeps <strong>" + f(fin.avgRev * fin.margin/100, fin.currency) + "</strong> as profit.");
      advice.push("Prioritise either raising prices by 5–10% or cutting the highest fixed-cost line items. A 5 percentage point margin improvement on your current revenue would add <strong>" + f(fin.totalRev * 0.05, fin.currency) + "</strong> to annual profit.");
    } else if (fin.margin < 20) {
      advice.push("Your margin of <strong>" + fin.margin.toFixed(1) + "%</strong> is in line with SME averages. The opportunity is to push above 20% — this is the threshold where reinvestment and resilience become much easier.");
      advice.push("A 5% margin improvement would add approximately <strong>" + f(fin.totalRev * 0.05 / fin.n * 12, fin.currency) + "</strong> to your annualised profit.");
    } else {
      advice.push("Your margin of <strong>" + fin.margin.toFixed(1) + "%</strong> is strong — above the 20% threshold that marks a financially resilient SME. You have room to reinvest without jeopardising stability.");
    }

    if (fin.expRatio > 85) advice.push("Your expense ratio is <strong>" + fin.expRatio.toFixed(1) + "%</strong> — meaning <strong>" + fin.expRatio.toFixed(0) + "p in every £1 of revenue</strong> goes straight back out. The target for a healthy SME is below 80%.");

    return ImpactGridAI.card("Profit Margin Analysis",
      "<p>Profit Margin: <strong>" + fin.margin.toFixed(2) + "%</strong> &nbsp;·&nbsp; Trend: <strong>" + trend + "</strong></p>" +
      "<p>Best margin month: <strong>" + best.toFixed(1) + "%</strong> &nbsp;·&nbsp; Worst: <strong>" + worst.toFixed(1) + "%</strong></p>" +
      "<p>" + advice.join("</p><p>") + "</p>",
      ["How do I cut costs?", "What's my break-even?", "How can I grow revenue?"]
    );
  },


  /* ===================================================================
     3. RISK ANALYSIS — volatility, stability, threat scoring
  =================================================================== */

  riskAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var volLevel = fin.volatility < 15 ? "Low" : fin.volatility < 30 ? "Moderate" : fin.volatility < 50 ? "Elevated" : "High";
    var volColor = fin.volatility < 15 ? "#2dd4a0" : fin.volatility < 30 ? "#c8a96e" : "#ff4d6d";

    var risks = [];
    var mitigations = [];

    if (fin.volatility > 30) {
      risks.push("Revenue swings by an average of <strong>±" + fin.stdDev.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",") + "</strong> month to month — this level of volatility makes cash flow planning difficult and increases the risk of a bad month causing real damage.");
      mitigations.push("Introduce <strong>retainer or subscription-based revenue</strong> to create a predictable income floor. Even covering 30% of monthly costs with recurring income significantly reduces operational risk.");
    }

    if (fin.margin < 8) {
      risks.push("A margin below 8% means a single bad month — a large unexpected expense, a slow sales period — could push you into loss. You have very little buffer.");
      mitigations.push("Build a <strong>cash reserve equivalent to 2–3 months of expenses</strong> (" + f(fin.avgExp * 2.5, currency) + "). This is your financial safety net before addressing margin improvement.");
    }

    if (fin.expCreep > 5) {
      risks.push("Costs have been rising faster than revenue over recent months (expense ratio up <strong>" + fin.expCreep.toFixed(1) + " points</strong>). If unchecked, this will compress margins further regardless of revenue growth.");
      mitigations.push("<strong>Audit your three largest expense categories</strong> immediately. Cost creep is almost always concentrated in 2–3 areas rather than spread evenly.");
    }

    if (fin.overallGrowth < 0) {
      risks.push("Revenue has declined by <strong>" + Math.abs(fin.overallGrowth).toFixed(1) + "%</strong> from your first to most recent month. A sustained downward trend is the most serious risk signal on this dashboard.");
      mitigations.push("Diagnose the decline before addressing it — is it seasonal, pricing-related, or demand-driven? Each requires a different response.");
    }

    if (risks.length === 0) {
      risks.push("No critical risk signals detected. Revenue volatility is low, margins are healthy, and cost structure is stable.");
      mitigations.push("Your primary risk is complacency — maintain monthly financial reviews and build a 3-month expense reserve if you haven't already.");
    }

    return ImpactGridAI.card("Risk Assessment",
      "<p>Revenue Volatility: <strong style='color:" + volColor + ";'>" + fin.volatility.toFixed(1) + "% — " + volLevel + "</strong></p>" +
      "<p><strong>Risk Factors:</strong></p><p>" + risks.join("</p><p>") + "</p>" +
      "<p><strong>Recommended Mitigations:</strong></p><p>" + mitigations.map(function(m){return "→ " + m;}).join("</p><p>") + "</p>",
      ["How do I reduce volatility?", "What's my break-even?", "How can I improve my margin?"]
    );
  },


  /* ===================================================================
     4. FORECAST ANALYSIS — multi-year with confidence bands
  =================================================================== */

  forecastAnalysis: function(question, fin, currency) {
    var f = ImpactGridAI.fc;
    var years = 3;
    if (/10/.test(question)) years = 10;
    else if (/5/.test(question)) years = 5;
    else if (/1/.test(question) && !/10/.test(question)) years = 1;

    if (fin.n < 3) return ImpactGridAI.card("Forecast",
      "<p>I need at least 3 months of data to generate a meaningful forecast. Add more records to activate this analysis.</p>",
      ["Add data first", "How does forecasting work?"]
    );

    // Use avg monthly growth for projection
    var monthlyGrowth = fin.avgGrowth / 100;
    var lastRev = fin.data[fin.n-1].revenue;

    var projected    = lastRev * Math.pow(1 + monthlyGrowth, years * 12);
    var optimistic   = projected * 1.20;
    var conservative = projected * 0.80;

    // Annualised run rate
    var annualRunRate = fin.avgRev * 12;

    // Payback on growth investment
    var growthInvestNote = fin.margin > 15
      ? "With your current margins, reinvesting <strong>" + f(fin.avgRev * 0.1, currency) + "/month</strong> (10% of average revenue) into growth activities is financially viable without threatening stability."
      : "Given margin pressure, any growth investment should be <strong>performance-based</strong> (commission, pay-per-result) rather than fixed cost.";

    // Trigger the chart
    try { if (typeof generateAIProjection === "function") generateAIProjection(years); } catch(e) {}

    var caution = fin.volatility > 30
      ? "<br><br><strong style='color:#f5a623;'>⚠ Forecast Caution:</strong> Your revenue volatility of <strong>" + fin.volatility.toFixed(1) + "%</strong> is high. These projections assume current trends continue — actual results could vary significantly. Reducing volatility first will make forecasts more reliable."
      : "";

    return ImpactGridAI.card(years + "-Year Revenue Forecast",
      "<p>Based on your average monthly growth rate of <strong>" + fin.avgGrowth.toFixed(2) + "%</strong>, here are your projected revenue outcomes after <strong>" + years + " years</strong>:</p>" +

      "<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0;'>" +
        ImpactGridAI.forecastTile("Conservative", f(conservative, currency), "#ff4d6d") +
        ImpactGridAI.forecastTile("Base Case",    f(projected, currency),    "#c8a96e") +
        ImpactGridAI.forecastTile("Optimistic",   f(optimistic, currency),   "#2dd4a0") +
      "</div>" +

      "<p>Your current annualised revenue run rate is <strong>" + f(annualRunRate, currency) + "</strong>.</p>" +
      "<p>" + growthInvestNote + "</p>" +
      caution,

      ["How do I hit the optimistic target?", "What risks could derail this?", "How can I grow faster?"]
    );
  },


  /* ===================================================================
     5. STRATEGIC ADVICE — specific, prioritised, numbered
  =================================================================== */

  strategicAdvice: function(fin, currency) {
    var f = ImpactGridAI.fc;
    var actions = [];

    // Priority 1: Stop the bleeding if declining
    if (fin.overallGrowth < -10) {
      actions.push({
        priority: "URGENT",
        color: "#ff4d6d",
        title: "Diagnose and halt revenue decline",
        detail: "Revenue has fallen <strong>" + Math.abs(fin.overallGrowth).toFixed(1) + "%</strong> over your tracked period. Before any growth initiative, understand <em>why</em> — pricing, lost customers, reduced demand, or seasonality. This diagnosis changes everything else."
      });
    }

    // Priority 2: Margin improvement if low
    if (fin.margin < 12) {
      var potentialGain = fin.totalRev * (0.12 - fin.margin/100);
      actions.push({
        priority: "HIGH",
        color: "#f5a623",
        title: "Improve profit margin to 12%+",
        detail: "Moving from <strong>" + fin.margin.toFixed(1) + "%</strong> to 12% margin would deliver an additional <strong>" + f(potentialGain / fin.n * 12, currency) + "</strong> in annualised profit at your current revenue level. Target your two highest expense categories first."
      });
    }

    // Priority 3: Address cost creep
    if (fin.expCreep > 4) {
      actions.push({
        priority: "HIGH",
        color: "#f5a623",
        title: "Reverse expense ratio creep",
        detail: "Your cost-to-revenue ratio has risen by <strong>" + fin.expCreep.toFixed(1) + " percentage points</strong> recently. Audit subscriptions, supplier contracts, and staffing costs — these are the most common sources of unnoticed cost creep in SMEs."
      });
    }

    // Priority 4: Revenue growth strategy
    if (fin.avgGrowth < 2 && fin.margin >= 10) {
      actions.push({
        priority: "MEDIUM",
        color: "#c8a96e",
        title: "Accelerate revenue growth",
        detail: "Growth of <strong>" + fin.avgGrowth.toFixed(1) + "%/month</strong> is below the 3–5% monthly target for a scaling SME. With your margins healthy, the priority is acquiring more customers. Double down on whatever channel drove your best month (" + fin.bestMonth.date.toISOString().slice(0,7) + " at " + f(fin.bestMonth.revenue, currency) + ")."
      });
    }

    // Priority 5: Capitalise on strong performance
    if (fin.margin > 20 && fin.avgGrowth > 3) {
      actions.push({
        priority: "OPPORTUNITY",
        color: "#2dd4a0",
        title: "Scale from a position of strength",
        detail: "Strong margins and solid growth create an ideal reinvestment window. Consider allocating <strong>" + f(fin.avgProf * 0.3, currency) + "/month</strong> (30% of average profit) to structured growth: marketing, equipment, or an additional revenue stream."
      });
    }

    // Priority 6: Build reserve
    if (fin.margin < 20) {
      actions.push({
        priority: "MEDIUM",
        color: "#c8a96e",
        title: "Build a 3-month expense reserve",
        detail: "Target: <strong>" + f(fin.avgExp * 3, currency) + "</strong>. This is non-negotiable for SME resilience. It prevents a bad quarter from forcing emergency decisions that damage the business long-term."
      });
    }

    if (actions.length === 0) {
      actions.push({
        priority: "MAINTAIN",
        color: "#2dd4a0",
        title: "Protect what's working",
        detail: "Your business is performing well across all key metrics. The strategic focus should be maintaining financial discipline, building reserves, and identifying the next growth lever without overextending."
      });
    }

    var html = "<p>Based on your current financial data, here are your <strong>" + actions.length + " strategic priorities</strong> in order of importance:</p>";
    actions.forEach(function(a, i) {
      html += "<div style='margin:10px 0;padding:12px 14px;background:#0a0d18;border:1px solid #1a2035;border-left:3px solid " + a.color + ";border-radius:8px;'>" +
        "<div style='font-size:10px;font-family:monospace;color:" + a.color + ";letter-spacing:0.1em;margin-bottom:4px;'>" + (i+1) + " · " + a.priority + "</div>" +
        "<div style='font-weight:700;color:#edf0f7;margin-bottom:6px;'>" + a.title + "</div>" +
        "<div style='font-size:13px;color:#7a8ba8;line-height:1.65;'>" + a.detail + "</div>" +
      "</div>";
    });

    return ImpactGridAI.card("Strategic Priorities", html,
      ["How do I improve margins?", "What's my 3-year forecast?", "How do I reduce risk?"]
    );
  },


  /* ===================================================================
     6. GROWTH STRATEGY
  =================================================================== */

  growthStrategy: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var revenueGap3pct = (fin.avgRev * 1.03) - fin.avgRev;
    var revenueGap5pct = (fin.avgRev * 1.05) - fin.avgRev;

    var readiness = fin.margin > 15 ? "well-positioned" : fin.margin > 8 ? "cautiously positioned" : "not yet ready";
    var readinessNote = fin.margin > 15
      ? "Your margins are healthy enough to absorb growth investment costs without putting the business at risk."
      : fin.margin > 8
        ? "Growth is viable but should be low-cost and performance-based — avoid large fixed commitments until margins improve."
        : "Focus on improving margins before investing in growth. Scaling a low-margin business amplifies problems, not profits.";

    return ImpactGridAI.card("Growth Strategy",
      "<p>You are <strong>" + readiness + "</strong> for growth. " + readinessNote + "</p>" +

      "<p>To grow revenue by <strong>3% per month</strong>, you need an additional <strong>" + f(revenueGap3pct, currency) + "/month</strong>. At 5% growth, that rises to <strong>" + f(revenueGap5pct, currency) + "/month</strong>.</p>" +

      "<p><strong>The three highest-leverage growth actions for an SME:</strong></p>" +
      "<p>→ <strong>Increase average transaction value</strong> — upselling, bundles, or tiered pricing. This is the fastest route to more revenue with no additional customer acquisition cost.</p>" +
      "<p>→ <strong>Reactivate past customers</strong> — your existing customer base is your cheapest marketing channel. A structured re-engagement campaign typically costs 5x less than acquiring new customers.</p>" +
      "<p>→ <strong>Replicate your best month</strong> — your best revenue month was <strong>" + fin.bestMonth.date.toISOString().slice(0,7) + "</strong> at <strong>" + f(fin.bestMonth.revenue, currency) + "</strong>. What was different? Weather, marketing, a specific product, a promotion? Identify and systematise it.</p>",

      ["How do I reduce costs?", "What's my 3-year forecast?", "How risky is my growth plan?"]
    );
  },


  /* ===================================================================
     7. COST REDUCTION
  =================================================================== */

  costReduction: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var savingTarget5  = fin.avgExp * 0.05;
    var savingTarget10 = fin.avgExp * 0.10;
    var marginIf5      = fin.totalRev > 0 ? ((fin.totalProf + savingTarget5 * fin.n) / fin.totalRev * 100) : 0;

    return ImpactGridAI.card("Cost Reduction Analysis",
      "<p>Your average monthly expenses are <strong>" + f(fin.avgExp, currency) + "</strong> — an expense ratio of <strong>" + fin.expRatio.toFixed(1) + "%</strong>.</p>" +

      "<p>A <strong>5% cost reduction</strong> would save <strong>" + f(savingTarget5, currency) + "/month</strong> and lift your margin to approximately <strong>" + marginIf5.toFixed(1) + "%</strong>. A 10% reduction saves <strong>" + f(savingTarget10, currency) + "/month</strong>.</p>" +

      "<p><strong>Where to look first (in order of typical SME impact):</strong></p>" +
      "<p>→ <strong>Software subscriptions</strong> — audit every recurring payment. Most SMEs find 20–30% of subscriptions are unused or duplicated.</p>" +
      "<p>→ <strong>Supplier renegotiation</strong> — if you have been with a supplier for 12+ months, request a review. Loyalty should translate to better pricing.</p>" +
      "<p>→ <strong>Energy and premises</strong> — often the second or third largest cost for physical businesses. Switching providers or renegotiating leases can yield 10–20% savings.</p>" +
      "<p>→ <strong>Payment processing fees</strong> — often overlooked. At scale, moving from 2.5% to 1.5% transaction fees can be significant.</p>" +
      (fin.expCreep > 3 ? "<p><strong style='color:#f5a623;'>⚠ Cost creep of " + fin.expCreep.toFixed(1) + " percentage points detected</strong> — your expense ratio has been rising. This should be addressed urgently before it compounds further.</p>" : ""),

      ["What's my profit margin?", "How can I grow revenue?", "What's my break-even?"]
    );
  },


  /* ===================================================================
     8. BREAK-EVEN ANALYSIS
  =================================================================== */

  breakEvenAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var monthsToBreakEven = fin.avgRev >= fin.breakEven ? 0 : "N/A";
    var coverageRatio = fin.breakEven > 0 ? fin.avgRev / fin.breakEven : 0;
    var safetyMargin  = fin.avgRev > fin.breakEven ? ((fin.avgRev - fin.breakEven) / fin.avgRev * 100) : 0;

    var coverageNote = coverageRatio >= 1.3
      ? "You are operating <strong>" + ((coverageRatio-1)*100).toFixed(0) + "% above break-even</strong> — a healthy safety margin."
      : coverageRatio >= 1.0
        ? "You are above break-even but with a slim safety margin of <strong>" + safetyMargin.toFixed(1) + "%</strong>. A 10–15% revenue drop would put you at risk."
        : "Your average revenue is <strong>below the estimated break-even point</strong>. This is a critical warning — the business is likely operating at a loss.";

    return ImpactGridAI.card("Break-Even Analysis",
      "<p><em>Note: Break-even is estimated based on your expense structure. For precision, categorise your fixed vs variable costs.</em></p>" +
      "<p>Estimated monthly break-even: <strong>" + f(fin.breakEven, currency) + "</strong><br>" +
      "Your average monthly revenue: <strong>" + f(fin.avgRev, currency) + "</strong><br>" +
      "Safety margin above break-even: <strong>" + safetyMargin.toFixed(1) + "%</strong></p>" +
      "<p>" + coverageNote + "</p>" +
      "<p>To improve your break-even position, either reduce fixed costs or increase revenue. A <strong>10% reduction in fixed costs</strong> would lower your break-even to approximately <strong>" + f(fin.breakEven * 0.9, currency) + "</strong>.</p>",
      ["How do I reduce fixed costs?", "What's my profit margin?", "How risky is my business?"]
    );
  },


  /* ===================================================================
     9. CASH FLOW ANALYSIS
  =================================================================== */

  cashFlowAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var monthlyNetCashFlow = fin.avgProf;
    var burnRate = fin.avgExp;
    var cashHealthy = monthlyNetCashFlow > 0;

    var runway = cashHealthy
      ? "Your business is cash-flow positive — generating <strong>" + f(monthlyNetCashFlow, currency) + "</strong> in net profit per month on average."
      : "Your business is cash-flow negative — burning approximately <strong>" + f(Math.abs(monthlyNetCashFlow), currency) + "</strong> per month.";

    var advice = cashHealthy
      ? "Build a cash reserve equivalent to <strong>3 months of expenses</strong> (" + f(burnRate * 3, currency) + ") before deploying surplus into growth."
      : "At this burn rate, you need to either increase revenue or reduce expenses urgently. Identify the single largest controllable cost and address it this week.";

    return ImpactGridAI.card("Cash Flow Health",
      "<p>Monthly burn rate (expenses): <strong>" + f(burnRate, currency) + "</strong><br>" +
      "Average monthly profit: <strong style='color:" + (cashHealthy ? "#2dd4a0" : "#ff4d6d") + ";'>" + f(monthlyNetCashFlow, currency) + "</strong></p>" +
      "<p>" + runway + "</p>" +
      "<p>" + advice + "</p>" +
      "<p>3-month reserve target: <strong>" + f(burnRate * 3, currency) + "</strong><br>" +
      "6-month reserve target: <strong>" + f(burnRate * 6, currency) + "</strong></p>",
      ["How do I improve cash flow?", "What's my break-even?", "How can I reduce costs?"]
    );
  },


  /* ===================================================================
     10. BEST / WORST MONTH ANALYSIS
  =================================================================== */

  bestWorstAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var revDiff   = fin.bestMonth.revenue - fin.worstMonth.revenue;
    var profDiff  = fin.bestProfit.profit  - fin.worstProfit.profit;

    return ImpactGridAI.card("Month-by-Month Performance",
      "<p><strong>Best revenue month:</strong> <strong>" + fin.bestMonth.date.toISOString().slice(0,7) + "</strong> — " + f(fin.bestMonth.revenue, currency) + "</p>" +
      "<p><strong>Worst revenue month:</strong> <strong>" + fin.worstMonth.date.toISOString().slice(0,7) + "</strong> — " + f(fin.worstMonth.revenue, currency) + "</p>" +
      "<p>The gap between best and worst revenue months is <strong>" + f(revDiff, currency) + "</strong> — a swing of <strong>" + (revDiff / fin.worstMonth.revenue * 100).toFixed(0) + "%</strong>.</p>" +
      "<p><strong>Best profit month:</strong> " + fin.bestProfit.date.toISOString().slice(0,7) + " at " + f(fin.bestProfit.profit, currency) + "<br>" +
      "<strong>Worst profit month:</strong> " + fin.worstProfit.date.toISOString().slice(0,7) + " at " + f(fin.worstProfit.profit, currency) + "</p>" +
      "<p>The key question is: <strong>what made " + fin.bestMonth.date.toISOString().slice(0,7) + " so strong?</strong> Was it a campaign, a product launch, seasonal demand, or something else? Systematising what worked in your best month is typically the highest-ROI growth activity available to an SME.</p>",
      ["Are there seasonal patterns?", "How can I replicate my best month?", "What's my growth trend?"]
    );
  },


  /* ===================================================================
     11. SEASONAL ANALYSIS
  =================================================================== */

  seasonalAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;
    var data = fin.data;

    // Group by calendar month
    var byMonth = {};
    data.forEach(function(d) {
      var m = d.date.getMonth();
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(d.revenue);
    });

    var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var monthAvgs  = [];
    Object.keys(byMonth).forEach(function(m) {
      var avg = byMonth[m].reduce(function(a,b){return a+b;},0) / byMonth[m].length;
      monthAvgs.push({ month: monthNames[parseInt(m)], avg: avg });
    });
    monthAvgs.sort(function(a,b){return b.avg - a.avg;});

    if (data.length < 6) {
      return ImpactGridAI.card("Seasonal Patterns",
        "<p>I need at least 6 months of data to identify reliable seasonal patterns. You currently have <strong>" + data.length + " months</strong>. Keep adding data and I'll identify your seasonal peaks and troughs.</p>",
        ["What can I do now?", "Show my performance", "What are my risks?"]
      );
    }

    return ImpactGridAI.card("Seasonal Pattern Analysis",
      "<p>Based on your data, here are your revenue patterns by calendar month:</p>" +
      "<p><strong>Strongest months:</strong> " + monthAvgs.slice(0,3).map(function(m){return "<strong>"+m.month+"</strong> (" + f(m.avg, currency) + ")";}).join(", ") + "</p>" +
      "<p><strong>Weakest months:</strong> " + monthAvgs.slice(-3).reverse().map(function(m){return "<strong>"+m.month+"</strong> (" + f(m.avg, currency) + ")";}).join(", ") + "</p>" +
      "<p>Plan around these patterns: <strong>prepare your strongest offers and marketing for peak months</strong>, and <strong>reduce discretionary spending in weaker months</strong> to protect cash flow.</p>",
      ["How do I prepare for slow periods?", "What's my revenue trend?", "Give me strategic advice"]
    );
  },


  /* ===================================================================
     12. EXPENSE ANALYSIS
  =================================================================== */

  expenseAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var expTrend = fin.expCreep > 3 ? "rising faster than revenue ⚠"
      : fin.expCreep < -2 ? "improving — good cost discipline ✓"
      : "broadly stable";

    return ImpactGridAI.card("Expense Analysis",
      "<p>Total expenses over " + fin.n + " months: <strong>" + f(fin.totalExp, currency) + "</strong><br>" +
      "Average monthly expenses: <strong>" + f(fin.avgExp, currency) + "</strong><br>" +
      "Expense ratio: <strong>" + fin.expRatio.toFixed(1) + "%</strong> of revenue<br>" +
      "Cost trend: <strong>" + expTrend + "</strong></p>" +

      (fin.expRatio > 85 ? "<p><strong style='color:#ff4d6d;'>High expense ratio of " + fin.expRatio.toFixed(1) + "%</strong> — for every £1 of revenue, " + fin.expRatio.toFixed(0) + "p is going on costs. The SME benchmark is 75–80%. Getting to 80% would add <strong>" + f((fin.expRatio - 80) / 100 * fin.totalRev / fin.n, currency) + "/month</strong> to your bottom line.</p>" : "") +

      (fin.expCreep > 3 ? "<p><strong style='color:#f5a623;'>Cost creep detected:</strong> Your expense ratio has risen by " + fin.expCreep.toFixed(1) + " percentage points recently. This is eroding your margins silently.</p>" : "") +

      "<p><strong>Expense optimisation priority order:</strong><br>" +
      "→ Fixed recurring costs (subscriptions, contracts, rent)<br>" +
      "→ Variable costs with alternatives (suppliers, utilities)<br>" +
      "→ One-off costs that are becoming regular</p>",
      ["What's my profit margin?", "How do I hit break-even?", "Give me strategic advice"]
    );
  },


  /* ===================================================================
     13. TREND ANALYSIS
  =================================================================== */

  trendAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;

    var trendWord = fin.trendAccel > 1 ? "accelerating" : fin.trendAccel < -1 ? "decelerating" : "steady";
    var trendNote = fin.trendAccel > 1
      ? "Growth is <strong>accelerating</strong> — recent months are outperforming earlier ones. This is a positive signal, but ensure your cost structure can scale with demand."
      : fin.trendAccel < -1
        ? "Growth is <strong>decelerating</strong> — your rate of growth has slowed in recent months. This warrants investigation before it becomes a reversal."
        : "Growth rate is <strong>broadly consistent</strong> — no significant acceleration or deceleration detected.";

    var streakNote = fin.currentStreak >= 2
      ? "You are currently on a <strong>" + fin.currentStreak + "-month " + fin.streakType + " streak</strong>."
      : "No significant streak pattern in recent data.";

    return ImpactGridAI.card("Revenue Trend Analysis",
      "<p>Overall growth (first to last month): <strong>" + fin.overallGrowth.toFixed(1) + "%</strong><br>" +
      "Average monthly growth rate: <strong>" + fin.avgGrowth.toFixed(2) + "%</strong><br>" +
      "Trend momentum: <strong>" + trendWord + "</strong></p>" +
      "<p>" + trendNote + "</p>" +
      "<p>" + streakNote + "</p>" +
      "<p>Margin trend: <strong>" + (fin.marginTrend > 1 ? "improving ↑" : fin.marginTrend < -1 ? "deteriorating ↓" : "stable →") + "</strong> (" + (fin.marginTrend >= 0 ? "+" : "") + fin.marginTrend.toFixed(1) + " percentage points over the period)</p>",
      ["What's causing my trend?", "Give me a 3-year forecast", "What should I do next?"]
    );
  },


  /* ===================================================================
     14. BENCHMARK ANALYSIS — industry comparisons
  =================================================================== */

  benchmarkAnalysis: function(fin, currency) {
    var biz = document.getElementById("businessType") ? document.getElementById("businessType").value : "other";

    var benchmarks = {
      cafe:       { margin: [8,  15], growth: [2, 5],  expRatio: [80, 88], label: "Café / Hospitality" },
      retail:     { margin: [5,  12], growth: [2, 6],  expRatio: [82, 90], label: "Retail" },
      ecommerce:  { margin: [10, 25], growth: [5, 15], expRatio: [70, 82], label: "E-commerce" },
      consulting: { margin: [25, 50], growth: [3, 8],  expRatio: [50, 70], label: "Consulting" },
      trade:      { margin: [10, 20], growth: [2, 6],  expRatio: [75, 85], label: "Trade / Contractor" },
      service:    { margin: [15, 30], growth: [3, 8],  expRatio: [65, 80], label: "Service SME" },
      other:      { margin: [10, 20], growth: [2, 6],  expRatio: [75, 85], label: "SME Average" }
    };

    var b = benchmarks[biz] || benchmarks["other"];

    function compare(val, low, high, higherBetter) {
      if (higherBetter) {
        if (val >= high) return { status: "✓ Above benchmark", color: "#2dd4a0" };
        if (val >= low)  return { status: "~ At benchmark",    color: "#c8a96e" };
        return { status: "✗ Below benchmark", color: "#ff4d6d" };
      } else {
        if (val <= low)  return { status: "✓ Below benchmark", color: "#2dd4a0" };
        if (val <= high) return { status: "~ At benchmark",    color: "#c8a96e" };
        return { status: "✗ Above benchmark", color: "#ff4d6d" };
      }
    }

    var mComp = compare(fin.margin,   b.margin[0],   b.margin[1],   true);
    var gComp = compare(fin.avgGrowth,b.growth[0],   b.growth[1],   true);
    var eComp = compare(fin.expRatio, b.expRatio[0], b.expRatio[1], false);

    return ImpactGridAI.card("Industry Benchmark — " + b.label,
      "<p>Your results vs typical <strong>" + b.label + "</strong> benchmarks:</p>" +

      "<div style='margin:12px 0;'>" +
        ImpactGridAI.benchmarkRow("Profit Margin",    fin.margin.toFixed(1)+"%",    b.margin[0]+"-"+b.margin[1]+"%",   mComp) +
        ImpactGridAI.benchmarkRow("Monthly Growth",   fin.avgGrowth.toFixed(1)+"%", b.growth[0]+"-"+b.growth[1]+"%",   gComp) +
        ImpactGridAI.benchmarkRow("Expense Ratio",    fin.expRatio.toFixed(1)+"%",  b.expRatio[0]+"-"+b.expRatio[1]+"%", eComp) +
      "</div>" +

      "<p style='font-size:12px;color:var(--text-muted);'>Benchmarks are based on typical UK SME ranges. Your actual targets may vary by size, location, and business model.</p>",
      ["How do I improve my margin?", "How can I reduce expenses?", "Give me strategic advice"]
    );
  },

  benchmarkRow: function(label, yours, benchmark, comp) {
    return "<div style='display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#0a0d18;border:1px solid #1a2035;border-radius:6px;margin-bottom:6px;flex-wrap:wrap;gap:6px;'>" +
      "<span style='font-size:12px;color:#7a8ba8;'>" + label + "</span>" +
      "<span style='font-family:monospace;font-size:12px;color:#edf0f7;font-weight:700;'>" + yours + "</span>" +
      "<span style='font-size:11px;color:#3d4e68;'>benchmark: " + benchmark + "</span>" +
      "<span style='font-size:11px;color:" + comp.color + ";font-weight:600;'>" + comp.status + "</span>" +
    "</div>";
  },


  /* ===================================================================
     15. INVESTMENT ADVICE
  =================================================================== */

  investmentAdvice: function(fin, currency) {
    var f = ImpactGridAI.fc;
    var investable = fin.avgProf * 0.25;
    var readiness = fin.margin > 15 ? "strong" : fin.margin > 8 ? "cautious" : "not yet ready";

    return ImpactGridAI.card("Investment & Reinvestment Advice",
      "<p>Investment readiness: <strong>" + readiness + "</strong>. At your current margins, a conservative reinvestment budget would be approximately <strong>" + f(investable, currency) + "/month</strong> (25% of average profit).</p>" +

      (fin.margin < 8 ? "<p><strong style='color:#ff4d6d;'>Do not invest in growth yet.</strong> With margins below 8%, investment amplifies risk rather than opportunity. Improve margins first, then deploy capital.</p>" :
      fin.margin < 15 ? "<p>Prioritise <strong>low-cost, high-return investments</strong>: staff training, process automation, or improving existing product quality. Avoid large fixed commitments until margins improve to 15%+.</p>" :
      "<p>You are in a strong position to reinvest. Highest-ROI options for SMEs at this stage: <strong>marketing</strong> (if LTV > 3× CAC), <strong>technology/automation</strong> (if it saves more than it costs within 12 months), or <strong>talent</strong> (if it directly drives revenue).</p>") +

      "<p>Whatever you invest in, set a <strong>clear 90-day return target</strong> and measure against it. Untracked investment is the most common source of SME financial drift.</p>",
      ["What's my profit margin?", "How can I grow revenue?", "Give me strategic advice"]
    );
  },


  /* ===================================================================
     16. CHART NARRATIVE
  =================================================================== */

  chartNarrative: function(fin, currency) {
    var f = ImpactGridAI.fc;
    var trendWord = fin.avgGrowth > 3 ? "upward" : fin.avgGrowth > 0 ? "gradual upward" : "declining";

    return ImpactGridAI.card("Chart Interpretation",
      "<p>Your charts tell the following story:</p>" +
      "<p><strong>Revenue chart</strong> shows a <strong>" + trendWord + " trend</strong> at " + fin.avgGrowth.toFixed(1) + "%/month average growth. " +
      (fin.trendAccel > 1 ? "Growth is accelerating — a positive signal." : fin.trendAccel < -1 ? "Growth is slowing — worth investigating." : "Growth rate is consistent.") + "</p>" +
      "<p><strong>Profit chart</strong> reflects your " + fin.margin.toFixed(1) + "% margin. " +
      (fin.marginTrend > 1 ? "Margins are improving — good cost discipline." : fin.marginTrend < -1 ? "Margins are compressing — expenses are growing faster than revenue." : "Margins are stable.") + "</p>" +
      "<p><strong>Expense chart</strong> — your average monthly cost is <strong>" + f(fin.avgExp, currency) + "</strong>. " +
      (fin.expCreep > 3 ? "<strong style='color:#f5a623;'>Cost creep detected — expenses rising faster than revenue.</strong>" : "Costs appear well-controlled relative to revenue.") + "</p>" +
      "<p>Best revenue month was <strong>" + fin.bestMonth.date.toISOString().slice(0,7) + "</strong> (" + f(fin.bestMonth.revenue, currency) + "). Worst was <strong>" + fin.worstMonth.date.toISOString().slice(0,7) + "</strong> (" + f(fin.worstMonth.revenue, currency) + ").</p>",
      ["What caused the best month?", "Are there seasonal patterns?", "What's my risk level?"]
    );
  },


  /* ===================================================================
     17. OPEN QUESTION — catch-all intelligent responder
  =================================================================== */

  openQuestion: function(q, fin, currency, history) {
    // Check conversation history for context
    if (history.length >= 2) {
      var lastTopic = history[history.length - 2].content || "";
      if (lastTopic.toLowerCase().includes("risk"))    return ImpactGridAI.riskAnalysis(fin, currency);
      if (lastTopic.toLowerCase().includes("margin"))  return ImpactGridAI.marginAnalysis(fin, currency);
      if (lastTopic.toLowerCase().includes("growth"))  return ImpactGridAI.growthStrategy(fin, currency);
      if (lastTopic.toLowerCase().includes("cost"))    return ImpactGridAI.costReduction(fin, currency);
    }
    // Default to full summary
    return ImpactGridAI.performanceSummary(fin, currency);
  },


  /* ===================================================================
     ANOMALY DETECTION
  =================================================================== */

  detectAnomalies: function(data) {
    if (!data || data.length < 3) return [];
    var revenues = data.map(function(d){return d.revenue;});
    var mean = revenues.reduce(function(a,b){return a+b;},0) / revenues.length;
    var variance = revenues.reduce(function(a,b){return a+Math.pow(b-mean,2);},0) / revenues.length;
    var std = Math.sqrt(variance);
    return data.filter(function(d){ return Math.abs(d.revenue - mean) > 1.5 * std; });
  },

  anomalyAnalysis: function(fin, currency) {
    var f = ImpactGridAI.fc;
    if (fin.anomalies.length === 0) {
      return ImpactGridAI.card("Anomaly Detection",
        "<p>No significant anomalies detected across your <strong>" + fin.n + " months</strong> of data. Revenue behaviour is consistent — no unusual spikes or drops that deviate significantly from your average.</p>",
        ["What's my revenue trend?", "Show seasonal patterns", "What are my risks?"]
      );
    }
    var list = fin.anomalies.map(function(a){
      var dir = a.revenue > fin.avgRev ? "above" : "below";
      return "<strong>" + a.date.toISOString().slice(0,7) + "</strong> — " + f(a.revenue, currency) + " (" + Math.abs(((a.revenue-fin.avgRev)/fin.avgRev)*100).toFixed(0) + "% " + dir + " average)";
    }).join("<br>");

    return ImpactGridAI.card("Anomaly Detection",
      "<p>The following months show statistically unusual revenue patterns:</p><p>" + list + "</p>" +
      "<p>For each anomaly, ask: <strong>what was different that month?</strong> If it was a peak, identify what drove it and make it repeatable. If it was a trough, identify the cause and build a contingency for it.</p>",
      ["What caused these anomalies?", "Are there seasonal patterns?", "How do I stabilise revenue?"]
    );
  },


  /* ===================================================================
     HEALTH SCORE CALCULATOR
  =================================================================== */

  calcHealthScore: function(fin) {
    var score = 0;
    score += Math.min(30, Math.max(0, fin.margin * 1.2));        // max 30 pts from margin
    score += Math.min(25, Math.max(0, fin.avgGrowth * 3));       // max 25 pts from growth
    score += Math.min(25, Math.max(0, 25 - fin.volatility*0.5)); // max 25 pts from stability
    score += Math.min(20, Math.max(0, (100-fin.expRatio)*0.5));  // max 20 pts from expense ratio
    return Math.min(100, Math.max(0, Math.round(score)));
  },


  /* ===================================================================
     HELPERS & UTILITIES
  =================================================================== */

  is: function(q, keywords) {
    return keywords.some(function(k){ return q.indexOf(k) !== -1; });
  },

  sum: function(data, key) {
    return data.reduce(function(a,b){ return a + (b[key]||0); }, 0);
  },

  fc: function(value, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style:"currency", currency: currency||"GBP" }).format(value);
    } catch(e) { return value.toFixed(2); }
  },

  forecastTile: function(label, value, color) {
    return "<div style='padding:12px;background:#0a0d18;border:1px solid " + color + "33;border-radius:8px;text-align:center;'>" +
      "<div style='font-size:10px;font-family:monospace;color:" + color + ";letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;'>" + label + "</div>" +
      "<div style='font-size:13px;font-weight:700;color:" + color + ";'>" + value + "</div>" +
    "</div>";
  },

  card: function(title, body, suggestions) {
    var chips = suggestions ? "<div class='ai-suggestions'>" +
      suggestions.map(function(s){
        return "<button class='ai-suggestion-chip' onclick=\"fillAIChat('" + s.replace(/'/g,"\\'") + "')\">" + s + "</button>";
      }).join("") +
    "</div>" : "";

    return "<p><strong>" + title + "</strong></p>" + body + chips;
  },

  noData: function() {
    return ImpactGridAI.card("ImpactGrid AI — Financial Adviser",
      "<p>Add your first month of revenue and expenses above and I'll begin analysing your business immediately.</p>" +
      "<p>Once you have 3+ months of data, I can provide: profit margin analysis, risk assessment, growth forecasts, expense optimisation, industry benchmarks, break-even calculations, and strategic priorities.</p>",
      ["How does ImpactGrid work?", "What data do I need?"]
    );
  },

  calculateGrowth: function(data) {
    if (!data || data.length < 2) return 0;
    var first = data[0].revenue, last = data[data.length-1].revenue;
    return first > 0 ? (last - first) / first * 100 : 0;
  },

  calculateVolatility: function(data) {
    if (!data || data.length < 2) return 0;
    var revs = data.map(function(d){return d.revenue;});
    var mean = revs.reduce(function(a,b){return a+b;},0)/revs.length;
    var variance = revs.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/revs.length;
    return mean > 0 ? Math.sqrt(variance)/mean*100 : 0;
  },

  getMargin: function(data) {
    var rev  = ImpactGridAI.sum(data,"revenue");
    var prof = ImpactGridAI.sum(data,"profit");
    return rev > 0 ? prof/rev*100 : 0;
  },

  calculateAvgMonthlyGrowth: function(data) {
    if (!data || data.length < 2) return 0;
    var rates = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i-1].revenue > 0)
        rates.push((data[i].revenue - data[i-1].revenue) / data[i-1].revenue);
    }
    return rates.length > 0 ? rates.reduce(function(a,b){return a+b;},0)/rates.length : 0;
  }

};
