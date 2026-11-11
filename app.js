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

    ["days-section", "cash-section", "data-section"].forEach(id => { document.getElementById(id).hidden = false; });
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
