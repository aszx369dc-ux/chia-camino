const STORAGE_KEY = "chia-camino-expenses-v1";
const BUDGET_KEY = "chia-camino-budget-v1";
const DEFAULT_BUDGET = 80000;
const BACKUP_VERSION = 1;
const TRIP_END = new Date("2026-08-19T23:59:59");
const CATEGORIES = ["住宿", "交通", "餐飲", "補給", "醫療", "觀光", "保險", "其他"];
const PAYMENT_METHODS = ["現金", "信用卡", "金融卡", "其他"];
const pendingMessages = [];

const seedExpenses = [
  { id: createId(), date: "2026-04-06", category: "交通", item: "來回機票", amount: 29977, payment: "信用卡", note: "台北－阿布達比－馬德里" },
  { id: createId(), date: "2026-06-29", category: "保險", item: "海外綜合險", amount: 3311, payment: "信用卡", note: "" },
  { id: createId(), date: "2026-07-01", category: "補給", item: "旅行小物", amount: 944, payment: "信用卡", note: "" },
  { id: createId(), date: "2026-07-02", category: "交通", item: "ALSA 巴士", amount: 1414, payment: "信用卡", note: "馬德里機場到 Bilbao" },
  { id: createId(), date: "2026-07-06", category: "住宿", item: "Bilbao 住宿", amount: 1156, payment: "信用卡", note: "7/14 入住" },
  { id: createId(), date: "2026-07-06", category: "其他", item: "換歐元手續費", amount: 147, payment: "現金", note: "" },
  { id: createId(), date: "2026-07-06", category: "醫療", item: "水泡貼", amount: 180, payment: "現金", note: "" },
  { id: createId(), date: "2026-07-12", category: "補給", item: "生活用品", amount: 447, payment: "信用卡", note: "" }
];

const $ = selector => document.querySelector(selector);
let expenses = loadExpenses();

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(random);
  } else {
    for (let index = 0; index < random.length; index += 1) random[index] = Math.floor(Math.random() * 256);
  }
  random[6] = (random[6] & 0x0f) | 0x40;
  random[8] = (random[8] & 0x3f) | 0x80;
  const hex = Array.from(random, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function showMessage(message) {
  const element = $("#appMessage");
  if (!element) {
    pendingMessages.push(message);
    return;
  }
  element.textContent = message;
  element.hidden = false;
}

function safeGetItem(key) {
  try {
    return { ok: true, value: localStorage.getItem(key) };
  } catch (error) {
    showMessage("瀏覽器目前無法讀取本機資料；本次變更可能無法保存。請確認瀏覽器的隱私或儲存空間設定。");
    return { ok: false, value: null, error };
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    showMessage("無法將資料儲存到這個瀏覽器。現有畫面仍可使用，但重新整理後本次變更可能遺失。");
    return false;
  }
}

function saveImportedBackup(serializedExpenses, budget) {
  let previousExpenses;
  let previousBudget;
  try {
    previousExpenses = localStorage.getItem(STORAGE_KEY);
    previousBudget = localStorage.getItem(BUDGET_KEY);
    localStorage.setItem(STORAGE_KEY, serializedExpenses);
    localStorage.setItem(BUDGET_KEY, String(budget));
    return true;
  } catch {
    try {
      if (previousExpenses === null) localStorage.removeItem(STORAGE_KEY);
      else if (previousExpenses !== undefined) localStorage.setItem(STORAGE_KEY, previousExpenses);
      if (previousBudget === null) localStorage.removeItem(BUDGET_KEY);
      else if (previousBudget !== undefined) localStorage.setItem(BUDGET_KEY, previousBudget);
    } catch {
      // The browser is refusing storage access; preserve the in-memory data below.
    }
    showMessage("瀏覽器無法完整儲存還原資料，因此未套用這份備份。");
    return false;
  }
}

function loadExpenses() {
  const result = safeGetItem(STORAGE_KEY);
  if (!result.ok) return seedExpenses.map(expense => ({ ...expense }));
  if (result.value === null) {
    safeSetItem(STORAGE_KEY, JSON.stringify(seedExpenses));
    return seedExpenses.map(expense => ({ ...expense }));
  }
  try {
    const parsed = JSON.parse(result.value);
    return validateExpenses(parsed, true);
  } catch {
    showMessage("已儲存的記帳資料格式損毀，因此暫時顯示預設資料。原始資料不會被覆蓋或刪除，請先匯出或檢查瀏覽器儲存內容。");
    return seedExpenses.map(expense => ({ ...expense }));
  }
}

function saveExpenses() {
  return safeSetItem(STORAGE_KEY, JSON.stringify(expenses));
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateExpenses(value, regenerateIds) {
  if (!Array.isArray(value)) throw new Error("expenses 必須是陣列");
  return value.map((row, index) => {
    const label = `第 ${index + 1} 筆支出`;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${label}不是有效物件`);
    if (typeof row.id !== "string" || !row.id.trim()) throw new Error(`${label}的 id 必須是非空白字串`);
    if (typeof row.date !== "string" || !isValidDate(row.date)) throw new Error(`${label}的日期無效`);
    if (!CATEGORIES.includes(row.category)) throw new Error(`${label}的類別不在允許清單中`);
    if (typeof row.item !== "string" || !row.item.trim() || row.item.trim().length > 50) throw new Error(`${label}的項目必須為 1 至 50 字`);
    if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0) throw new Error(`${label}的金額必須是大於 0 的有限數字`);
    if (!PAYMENT_METHODS.includes(row.payment)) throw new Error(`${label}的付款方式不在允許清單中`);
    if (typeof row.note !== "string" || row.note.length > 80) throw new Error(`${label}的備註必須是最多 80 字的字串`);
    return {
      id: regenerateIds ? createId() : row.id,
      date: row.date,
      category: row.category,
      item: row.item.trim(),
      amount: row.amount,
      payment: row.payment,
      note: row.note
    };
  });
}

function validBudget(value) {
  const budget = typeof value === "number" ? value : Number(value);
  return Number.isFinite(budget) && budget > 0 ? budget : null;
}

function loadBudget() {
  const result = safeGetItem(BUDGET_KEY);
  if (!result.ok || result.value === null) return DEFAULT_BUDGET;
  const budget = validBudget(result.value);
  if (budget === null || ![...$("#budgetLimit").options].some(option => Number(option.value) === budget)) {
    showMessage("已儲存的預算值無效，目前改用預設預算 NT$80,000；原始值未被覆蓋。");
    return DEFAULT_BUDGET;
  }
  return budget;
}

function money(value) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function render() {
  expenses.sort((a, b) => b.date.localeCompare(a.date));
  const budget = validBudget($("#budgetLimit").value) || DEFAULT_BUDGET;
  const total = expenses.reduce((sum, row) => sum + row.amount, 0);
  const remaining = budget - total;
  const remainingDays = Math.max(1, Math.ceil((TRIP_END - new Date()) / 86400000));
  const percent = Math.max(0, total / budget * 100);

  $("#totalSpent").textContent = money(total);
  $("#remainingBudget").textContent = money(remaining);
  $("#dailyAllowance").textContent = money(Math.max(0, Math.floor(remaining / remainingDays)));
  $("#budgetPercent").textContent = `已使用 ${percent.toFixed(1)}%`;
  $("#budgetBar").style.width = `${Math.min(100, percent)}%`;
  $("#budgetBar").style.background = percent > 100 ? "#b33a32" : percent > 85 ? "#d08a30" : "#1f5f4a";
  $("#budgetStatus").textContent = remaining < 0 ? `超支 ${money(Math.abs(remaining))}` : percent > 85 ? "接近上限" : "預算仍在掌握中";

  const rows = $("#expenseRows");
  rows.replaceChildren();
  if (!expenses.length) {
    const row = document.createElement("tr");
    const cell = appendCell(row, "還沒有支出紀錄。");
    cell.colSpan = 6;
    rows.append(row);
  } else {
    expenses.forEach(expense => {
      const row = document.createElement("tr");
      appendCell(row, expense.date);
      appendCell(row, expense.category);
      const itemCell = appendCell(row, expense.item);
      if (expense.note) {
        itemCell.append(document.createElement("br"));
        const note = document.createElement("small");
        note.textContent = expense.note;
        itemCell.append(note);
      }
      appendCell(row, expense.payment);
      appendCell(row, money(expense.amount), "money");
      const actionCell = appendCell(row, "");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete-button";
      button.dataset.id = expense.id;
      button.setAttribute("aria-label", `刪除 ${expense.item}`);
      button.textContent = "刪除";
      button.addEventListener("click", () => {
        if (!confirm("確定刪除這筆支出嗎？")) return;
        expenses = expenses.filter(item => item.id !== button.dataset.id);
        saveExpenses();
        render();
      });
      actionCell.append(button);
      rows.append(row);
    });
  }

  const categoryTotals = expenses.reduce((totals, expense) => {
    totals.set(expense.category, (totals.get(expense.category) || 0) + expense.amount);
    return totals;
  }, new Map());
  const summary = $("#categorySummary");
  summary.replaceChildren();
  [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, value]) => {
    const chip = document.createElement("span");
    chip.className = "category-chip";
    chip.textContent = `${name} · ${money(value)}`;
    summary.append(chip);
  });
}

$("#expenseForm").addEventListener("submit", event => {
  event.preventDefault();
  expenses.push({
    id: createId(),
    date: $("#expenseDate").value,
    category: $("#expenseCategory").value,
    item: $("#expenseItem").value.trim(),
    amount: Number($("#expenseAmount").value),
    payment: $("#paymentMethod").value,
    note: $("#expenseNote").value.trim()
  });
  saveExpenses();
  event.target.reset();
  $("#expenseDate").valueAsDate = new Date();
  render();
});

$("#budgetLimit").addEventListener("change", event => {
  const budget = validBudget(event.target.value);
  if (budget !== null) safeSetItem(BUDGET_KEY, String(budget));
  render();
});

$("#exportCsv").addEventListener("click", () => {
  const header = ["日期", "類別", "項目", "付款方式", "金額(TWD)", "備註"];
  const lines = [header, ...expenses.map(row => [row.date, row.category, row.item, row.payment, row.amount, row.note])]
    .map(columns => columns.map(csvCell).join(","));
  download(`camino-expenses-${new Date().toISOString().slice(0, 10)}.csv`, "\ufeff" + lines.join("\n"), "text/csv;charset=utf-8");
});

$("#exportJson").addEventListener("click", () => {
  const backup = {
    version: BACKUP_VERSION,
    budget: validBudget($("#budgetLimit").value) || DEFAULT_BUDGET,
    expenses
  };
  download(`camino-expenses-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
});

$("#importJson").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const isLegacy = Array.isArray(parsed);
    if (!isLegacy && (!parsed || typeof parsed !== "object" || parsed.version !== BACKUP_VERSION)) {
      throw new Error("備份版本不受支援");
    }
    const importedBudget = isLegacy
      ? validBudget($("#budgetLimit").value) || DEFAULT_BUDGET
      : typeof parsed.budget === "number" ? validBudget(parsed.budget) : null;
    if (importedBudget === null) throw new Error("預算必須是大於 0 的有限數字");
    const budgetOptionExists = [...$("#budgetLimit").options].some(option => Number(option.value) === importedBudget);
    if (!budgetOptionExists) throw new Error("預算不在網站提供的選項中");
    const importedExpenses = validateExpenses(isLegacy ? parsed : parsed.expenses, true);
    const serializedExpenses = JSON.stringify(importedExpenses);

    if (!saveImportedBackup(serializedExpenses, importedBudget)) throw new Error("瀏覽器無法完整儲存還原資料");

    expenses = importedExpenses;
    $("#budgetLimit").value = String(importedBudget);
    render();
    alert(isLegacy ? "舊版記帳資料已驗證並還原；預算沿用目前設定。" : "記帳資料與預算已還原。");
  } catch (error) {
    alert(`無法還原這份 JSON 備份：${error instanceof Error ? error.message : "格式錯誤"}。現有畫面資料未變更。`);
  }
  event.target.value = "";
});

function csvCell(value) {
  let text = String(value ?? "");
  const withoutLeadingSpaces = text.replace(/^ +/, "");
  if (/^[\t\r]/.test(withoutLeadingSpaces) || /^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("#expenseDate").valueAsDate = new Date();
$("#budgetLimit").value = String(loadBudget());
render();
pendingMessages.forEach(showMessage);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {
    showMessage("離線功能目前無法啟用；連線時仍可正常使用網站。");
  });
}
