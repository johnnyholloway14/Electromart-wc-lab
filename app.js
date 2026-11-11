// app.js: loads the CSV files and puts the results from ccc.js on the page.
// All numbers come from data/*.csv. Nothing is sent anywhere.

(function () {
  "use strict";

  const fmtDays = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDollars = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  // Show −0.00 as 0.00 so a change of nothing doesn't look negative.
  function clean(n, decimals) {
    const r = Number(n.toFixed(decimals));
    return r === 0 ? 0 : n;
  }
  function days(n) { return fmtDays.format(clean(n, 2)).replace("-", "−"); }
  function dollars(n) { return fmtDollars.format(clean(n, 0)).replace("-", "−"); }
  function signedDays(n) { const s = days(n); return clean(n, 2) > 0 ? "+" + s : s; }
  function percent(n) { return days(n * 100) + "%"; }

  const LABELS = {
    revenue: "Revenue",
    cogs: "Cost of goods sold",
    operating_expenses: "Operating expenses",
    cash: "Cash",
    accounts_receivable: "Accounts receivable",
    inventory: "Inventory",
    net_fixed_and_other_assets: "Net fixed and other assets",
    accounts_payable: "Accounts payable",
    notes_payable: "Notes payable (bank line)",
    long_term_debt: "Long-term debt",
    common_equity: "Common equity",
  };
  function label(item) {
    return LABELS[item] || item.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  }

  function row(cells, headerFirst) {
    const tr = document.createElement("tr");
    cells.forEach((text, i) => {
      const cell = document.createElement(i === 0 && headerFirst ? "th" : "td");
      if (i === 0 && headerFirst) cell.scope = "row";
      cell.textContent = text;
      tr.appendChild(cell);
    });
    return tr;
  }

  function render(r) {
    const daysInYear = r.assumptions.days_in_year;
    document.getElementById("days-in-year").textContent = daysInYear;

    // Days table
    const daysBody = document.getElementById("days-body");
    daysBody.replaceChildren();
    [["DIO", "dio"], ["DSO", "dso"], ["DPO", "dpo"], ["CCC", "ccc"]].forEach(([name, key]) => {
      const tr = row([name, days(r.before[key]), days(r.after[key]), signedDays(r.after[key] - r.before[key])], true);
      if (key === "ccc") tr.className = "total";
      daysBody.appendChild(tr);
    });

    // Cash freed table
    const cf = r.cashFreed;
    const levers = [
      ["Inventory", cf.inventory, "DIO", "COGS"],
      ["Receivables", cf.receivables, "DSO", "revenue"],
      ["Payables", cf.payables, "DPO", "COGS"],
    ];
    const cashBody = document.getElementById("cash-body");
    cashBody.replaceChildren();
    levers.forEach(([name, l]) => {
      cashBody.appendChild(row([name, dollars(l.balanceBefore), dollars(l.balanceAfter), dollars(l.freed)], true));
    });
    const foot = document.getElementById("cash-foot");
    foot.replaceChildren();
    const totalRow = row(["Total", "", "", dollars(cf.total)], true);
    totalRow.className = "total";
    foot.appendChild(totalRow);

    // The same cash freed, worked out from the days
    const checks = document.getElementById("cash-checks");
    checks.replaceChildren();
    levers.forEach(([name, l, measure, baseName]) => {
      const li = document.createElement("li");
      const change = name === "Payables"
        ? "(" + days(l.daysAfter) + " − " + days(l.daysBefore) + ")"
        : "(" + days(l.daysBefore) + " − " + days(l.daysAfter) + ")";
      li.textContent = name + ": " + change + " " + measure + " days × " + dollars(l.base) +
        " " + baseName + " / " + daysInYear + " = " + dollars(l.fromDays);
      checks.appendChild(li);
    });

    // Raw data
    const dataBody = document.getElementById("data-body");
    dataBody.replaceChildren();
    Object.keys(r.statements.before).forEach(item => {
      dataBody.appendChild(row([label(item), dollars(r.statements.before[item]), dollars(r.statements.after[item])], true));
    });

    setupLevers(r);

    ["days-section", "cash-section", "levers-section", "data-section"].forEach(id => {
      document.getElementById(id).hidden = false;
    });
  }

  // ---------- Levers ----------

  const KEYS = ["dio", "dso", "dpo"];

  function sliderMax(r, key) {
    // Room to go well past both Before and After, in whole tens of days.
    const top = Math.max(r.before[key], r.after[key], r.assumptions.net_days);
    return Math.ceil(top * 2 / 10) * 10;
  }

  function setLevers(values) {
    KEYS.forEach(key => {
      // Assign the exact, unrounded day count. step="any" keeps it from snapping.
      document.getElementById(key + "-slider").value = String(values[key]);
    });
  }

  function readLevers() {
    const v = {};
    KEYS.forEach(key => { v[key] = document.getElementById(key + "-slider").valueAsNumber; });
    return v;
  }

  function setupLevers(r) {
    KEYS.forEach(key => {
      const s = document.getElementById(key + "-slider");
      s.max = String(sliderMax(r, key));
      s.oninput = () => updateLevers(r);
    });
    document.getElementById("set-before").onclick = () => { setLevers(r.before); updateLevers(r); };
    document.getElementById("set-after").onclick = () => { setLevers(r.after); updateLevers(r); };

    const a = r.assumptions;
    document.querySelectorAll(".diy").forEach(el => { el.textContent = a.days_in_year; });
    document.getElementById("terms-note").textContent =
      "Supplier terms: " + percent(a.supplier_discount) + " discount if paid within " + a.discount_days +
      " days, otherwise due in " + a.net_days + " days. Cost of skipping the discount = d / (1 − d) × " +
      a.days_in_year + " / (DPO − " + a.discount_days + "). ElectroMart takes the discount only if DPO is " +
      a.discount_days + " days or less.";

    setLevers(r.before);
    updateLevers(r);
  }

  function discountText(d) {
    return d.takesDiscount ? "Takes discount" : percent(d.cost);
  }

  function updateLevers(r) {
    const a = r.assumptions;
    const before = r.statements.before;
    const v = readLevers();
    const res = window.CCC.leverResults(before, a, v);

    KEYS.forEach(key => { document.getElementById(key + "-value").textContent = days(v[key]) + " days"; });

    // 1. Days and CCC
    const daysBody = document.getElementById("lever-days-body");
    daysBody.replaceChildren();
    [["DIO", "dio"], ["DSO", "dso"], ["DPO", "dpo"], ["CCC", "ccc"]].forEach(([name, key]) => {
      const now = key === "ccc" ? res.ccc : v[key];
      const tr = row([name, days(r.before[key]), days(now), signedDays(now - r.before[key])], true);
      if (key === "ccc") tr.className = "total";
      daysBody.appendChild(tr);
    });

    // 2–3. Implied balances and cash freed
    const cashBody = document.getElementById("lever-cash-body");
    cashBody.replaceChildren();
    [
      ["Inventory", before.inventory, res.balances.inventory, res.freed.inventory],
      ["Receivables", before.accounts_receivable, res.balances.receivables, res.freed.receivables],
      ["Payables", before.accounts_payable, res.balances.payables, res.freed.payables],
    ].forEach(([name, b, implied, freed]) => {
      cashBody.appendChild(row([name, dollars(b), dollars(implied), dollars(freed)], true));
    });
    const foot = document.getElementById("lever-cash-foot");
    foot.replaceChildren();
    const totalRow = row(["Total cash freed", "", "", dollars(res.totalFreed)], true);
    totalRow.className = "total";
    foot.appendChild(totalRow);

    // 4. Interest saved
    const intBody = document.getElementById("lever-interest-body");
    intBody.replaceChildren();
    intBody.appendChild(row(["Bank line, Before", dollars(res.bankLineBefore)], true));
    intBody.appendChild(row([res.interest.paidDown >= 0 ? "Paid down" : "Extra borrowing", dollars(Math.abs(res.interest.paidDown))], true));
    intBody.appendChild(row(["Bank rate", percent(a.bank_rate)], true));
    const savedRow = row(["Interest saved per year (if all freed cash repays the bank line)", dollars(res.interest.saved)], true);
    savedRow.className = "total";
    intBody.appendChild(savedRow);

    // 5. Paying suppliers
    const beforeDiscount = window.CCC.discountCost(r.before.dpo, a.supplier_discount, a.discount_days, a.days_in_year);
    const supBody = document.getElementById("lever-supplier-body");
    supBody.replaceChildren();
    supBody.appendChild(row(["Days past net-" + a.net_days + " due date",
      days(window.CCC.daysPastDue(r.before.dpo, a.net_days)), days(res.daysPastDue)], true));
    supBody.appendChild(row(["Annual cost of skipping the discount",
      discountText(beforeDiscount), discountText(res.discount)], true));
  }

  async function getText(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error("Couldn't load " + path + " (" + res.status + ").");
    return res.text();
  }

  async function start() {
    const status = document.getElementById("status");
    try {
      const [statements, assumptions] = await Promise.all([
        getText("data/electromart.csv"),
        getText("data/assumptions.csv"),
      ]);
      render(window.CCC.analyze(statements, assumptions));
      status.hidden = true;
    } catch (err) {
      status.textContent = "Something went wrong: " + err.message;
      status.classList.add("error");
    }
  }

  start();
})();
