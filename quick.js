const QUICK_EXPENSE_FIELDS = [
  { selector: "#quickLodging", category: "住宿", item: "今日住宿" },
  { selector: "#quickFood", category: "餐飲", item: "今日餐飲" },
  { selector: "#quickSupplies", category: "補給", item: "今日補給" },
  { selector: "#quickCoffee", category: "餐飲", item: "今日咖啡" },
  { selector: "#quickTransport", category: "交通", item: "今日交通" },
  { selector: "#quickOther", category: "其他", item: "今日其他" }
];
const QUICK_EXPENSE_ITEMS = QUICK_EXPENSE_FIELDS.map(field => field.item);

function quickElement(selector) {
  return document.querySelector(selector);
}

function renderNetworkStatus() {
  const online = navigator.onLine;
  const container = quickElement("#networkStatus");
  container.classList.toggle("is-offline", !online);
  quickElement("#networkStatusTitle").textContent = online ? "🌐 已連線" : "🟢 離線模式";
  quickElement("#networkStatusDetail").hidden = online;
}

window.addEventListener("online", renderNetworkStatus);
window.addEventListener("offline", renderNetworkStatus);

function quickShowMessage(message, isError = false) {
  const element = quickElement("#quickRecordMessage");
  element.textContent = message;
  element.hidden = false;
  element.style.background = isError ? "#f8e5e2" : "#dce9df";
  element.style.color = isError ? "#71332e" : "#17342b";
}

function quickExpenseAmount(selector) {
  const raw = quickElement(selector).value.trim();
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("支出金額必須是有限且不小於 0 的數字");
  return amount > 0 ? amount : null;
}

function buildQuickDiary() {
  return {
    id: diaryCreateId(),
    date: quickElement("#quickDate").value,
    day: Number(quickElement("#quickDay").value),
    start: quickElement("#quickStart").value,
    end: quickElement("#quickEnd").value,
    distance: Number(quickElement("#quickDistance").value),
    mood: quickElement("#quickMood").value,
    weather: quickElement("#quickWeather").value,
    people: quickElement("#quickPeople").value,
    events: quickElement("#quickEvents").value,
    quote: quickElement("#quickQuote").value,
    tomorrow: quickElement("#quickTomorrow").value,
    content: quickElement("#quickContent").value
  };
}

function buildQuickExpenses(date) {
  return QUICK_EXPENSE_FIELDS.flatMap(field => {
    const amount = quickExpenseAmount(field.selector);
    if (amount === null) return [];
    return [{
      id: createId(),
      date,
      category: field.category,
      item: field.item,
      amount,
      payment: "現金",
      note: ""
    }];
  });
}

function commitQuickRecord(nextExpenses, nextDiaryEntries, changeTime) {
  const keys = [STORAGE_KEY, DIARY_STORAGE_KEY, LAST_CHANGE_KEY];
  const previous = new Map();
  try {
    keys.forEach(key => previous.set(key, localStorage.getItem(key)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextExpenses));
    localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(nextDiaryEntries));
    localStorage.setItem(LAST_CHANGE_KEY, changeTime);
    return true;
  } catch {
    try {
      keys.forEach(key => {
        const oldValue = previous.get(key);
        if (oldValue === null) localStorage.removeItem(key);
        else if (oldValue !== undefined) localStorage.setItem(key, oldValue);
      });
    } catch {
      // Storage is unavailable; keep both in-memory collections unchanged.
    }
    return false;
  }
}

function resetQuickRecordForm() {
  quickElement("#quickRecordForm").reset();
  quickElement("#quickDate").valueAsDate = new Date();
  quickElement("#quickRecordPanel").open = false;
}

function quickBackupSuggestion() {
  const lastBackup = safetyValidTimestamp(safetyGetItem(LAST_BACKUP_KEY));
  const backupTooOld = !lastBackup || safetyCalendarAge(lastBackup) > 5;
  const lastChange = safetyValidTimestamp(safetyGetItem(LAST_CHANGE_KEY));
  return backupTooOld || !lastBackup || !lastChange || lastChange > lastBackup;
}

quickElement("#quickRecordForm").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const diary = validateDiaryEntries([buildQuickDiary()], false)[0];
    const newExpenses = validateExpenses(buildQuickExpenses(diary.date), false);

    if (diaryEntries.some(entry => entry.date === diary.date)) {
      if (!confirm("這一天已經有日記。繼續會再新增一篇，是否繼續？")) return;
    }

    const duplicateItems = expenses
      .filter(expense => expense.date === diary.date && QUICK_EXPENSE_ITEMS.includes(expense.item))
      .map(expense => expense.item);
    if (duplicateItems.length) {
      const names = [...new Set(duplicateItems)].join("、");
      if (!confirm(`這一天已經有快速紀錄支出（${names}），繼續可能造成重複，是否繼續？`)) return;
    }

    const nextExpenses = [...expenses, ...newExpenses];
    const nextDiaryEntries = [...diaryEntries, diary];
    const changeTime = new Date().toISOString();
    if (!commitQuickRecord(nextExpenses, nextDiaryEntries, changeTime)) {
      throw new Error("瀏覽器無法完整儲存支出與日記，已嘗試回復原本資料");
    }

    expenses = nextExpenses;
    diaryEntries = nextDiaryEntries;
    render();
    renderDiaryEntries();
    renderSafetyCenter();
    resetQuickRecordForm();
    const suggestion = quickBackupSuggestion() ? "\n建議順便備份旅行資料。" : "";
    quickShowMessage(`今天的紀錄已完成。${suggestion}`);
    window.dispatchEvent(new Event("camino:data-changed"));
  } catch (error) {
    quickShowMessage(error instanceof Error ? error.message : "無法完成今天的紀錄", true);
  }
});

renderNetworkStatus();
resetQuickRecordForm();
