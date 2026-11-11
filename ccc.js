// ccc.js: the finance math for the ElectroMart CCC app.
// These functions never touch the page, so they can be checked with Node:
//   node -e "const C = require('./ccc.js'); console.log(C.dio(1200000, 6000000, 365))"
// Nothing here is rounded. Rounding happens only when app.js displays a number.

(function (root) {
  "use strict";

  // ---------- Reading the CSV files ----------

  // Turn CSV text into an array of objects keyed by the header row.
  // Handles quoted fields, so a note like "2/10, net 30" won't break it.
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const s = String(text).replace(/^﻿/, ""); // drop a byte-order mark if present

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field); field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && s[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

    const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ""));
    if (nonEmpty.length === 0) return [];
    const header = nonEmpty[0].map(h => h.trim());
    return nonEmpty.slice(1).map(r => {
      const obj = {};
      header.forEach((h, j) => { obj[h] = (r[j] || "").trim(); });
      return obj;
    });
  }

  function toNumber(value, label) {
    const n = Number(String(value).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) throw new Error("Not a number for " + label + ": \"" + value + "\"");
    return n;
  }

  // Which section each line the app needs must come from.
  const REQUIRED_ITEMS = {
    revenue: "income_statement",
    cogs: "income_statement",
    accounts_receivable: "asset",
    inventory: "asset",
    accounts_payable: "liability_or_equity",
  };

  // Rows from electromart.csv -> { before: {item: value}, after: {...}, section: {item: section} }
  function statementsFromRows(rows) {
    const out = { before: {}, after: {}, section: {} };
    rows.forEach(r => {
      const item = r.item;
      if (!item) return;
      out.section[item] = r.section;
      out.before[item] = toNumber(r.before, item + " (before)");
      out.after[item] = toNumber(r.after, item + " (after)");
    });
    Object.keys(REQUIRED_ITEMS).forEach(item => {
      if (!(item in out.before)) throw new Error("The CSV has no \"" + item + "\" line.");
      if (out.section[item] !== REQUIRED_ITEMS[item]) {
        throw new Error("\"" + item + "\" should be in section " + REQUIRED_ITEMS[item] +
          ", but the CSV says \"" + out.section[item] + "\".");
      }
    });
    return out;
  }

  // Rows from assumptions.csv -> { days_in_year: 365, bank_rate: 0.08, ... }
  function assumptionsFromRows(rows) {
    const out = {};
    rows.forEach(r => { if (r.assumption) out[r.assumption] = toNumber(r.value, r.assumption); });
    if (!(out.days_in_year > 0)) throw new Error("assumptions.csv needs a positive days_in_year.");
    return out;
  }

  // ---------- Days ----------

  // Days inventory outstanding: how long goods sit before they're sold.
  function dio(inventory, cogs, daysInYear) { return inventory / cogs * daysInYear; }

  // Days sales outstanding: how long customers take to pay (all sales are on credit).
  function dso(receivables, revenue, daysInYear) { return receivables / revenue * daysInYear; }

  // Days payables outstanding: how long ElectroMart takes to pay suppliers (purchases = COGS).
  function dpo(payables, cogs, daysInYear) { return payables / cogs * daysInYear; }

  // Cash conversion cycle: days a dollar is tied up in operations.
  function ccc(dioDays, dsoDays, dpoDays) { return dioDays + dsoDays - dpoDays; }

  // All four day counts for one period's statements.
  function periodDays(p, daysInYear) {
    const d = {
      dio: dio(p.inventory, p.cogs, daysInYear),
      dso: dso(p.accounts_receivable, p.revenue, daysInYear),
      dpo: dpo(p.accounts_payable, p.cogs, daysInYear),
    };
    d.ccc = ccc(d.dio, d.dso, d.dpo);
    return d;
  }

  // ---------- Cash freed ----------

  // Cash freed comes from the balance sheet change:
  //   a drop in an asset frees cash; a rise in accounts payable frees cash.
  // "fromDays" is the same number worked out from the day counts, as a check:
  //   days changed x annual COGS (or revenue) / days in year.
  function cashFreed(before, after, daysInYear) {
    const b = periodDays(before, daysInYear);
    const a = periodDays(after, daysInYear);
    const inventory = {
      balanceBefore: before.inventory,
      balanceAfter: after.inventory,
      freed: before.inventory - after.inventory,
      daysBefore: b.dio, daysAfter: a.dio, base: before.cogs,
      fromDays: (b.dio - a.dio) * before.cogs / daysInYear,
    };
    const receivables = {
      balanceBefore: before.accounts_receivable,
      balanceAfter: after.accounts_receivable,
      freed: before.accounts_receivable - after.accounts_receivable,
      daysBefore: b.dso, daysAfter: a.dso, base: before.revenue,
      fromDays: (b.dso - a.dso) * before.revenue / daysInYear,
    };
    const payables = {
      balanceBefore: before.accounts_payable,
      balanceAfter: after.accounts_payable,
      freed: after.accounts_payable - before.accounts_payable,
      daysBefore: b.dpo, daysAfter: a.dpo, base: before.cogs,
      fromDays: (a.dpo - b.dpo) * before.cogs / daysInYear,
    };
    return {
      inventory, receivables, payables,
      total: inventory.freed + receivables.freed + payables.freed,
    };
  }

  // Everything the page needs, from the two CSV texts.
  function analyze(statementsCSV, assumptionsCSV) {
    const st = statementsFromRows(parseCSV(statementsCSV));
    const as = assumptionsFromRows(parseCSV(assumptionsCSV));
    const days = as.days_in_year;
    return {
      statements: st,
      assumptions: as,
      before: periodDays(st.before, days),
      after: periodDays(st.after, days),
      cashFreed: cashFreed(st.before, st.after, days),
    };
  }

  const api = {
    parseCSV, statementsFromRows, assumptionsFromRows,
    dio, dso, dpo, ccc, periodDays, cashFreed, analyze,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CCC = api;
})(typeof window !== "undefined" ? window : this);
