const LAST_BACKUP_KEY = "chia-camino-last-backup-v1";
const LAST_CHANGE_KEY = "chia-camino-last-change-v1";
const TRAVEL_BACKUP_VERSION = 1;
const TRAVEL_BACKUP_TYPE = "camino-travel-backup";

function safetyElement(selector) {
  return document.querySelector(selector);
}

function safetyShowMessage(message) {
  const element = safetyElement("#safetyMessage");
  element.textContent = message;
  element.hidden = false;
}

function safetyGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    safetyShowMessage("瀏覽器目前無法讀取備份狀態。請確認隱私或儲存空間設定。");
    return null;
  }
}

function safetySetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    safetyShowMessage("瀏覽器無法儲存備份時間，但下載仍可能已完成。");
    return false;
  }
}

function safetyValidTimestamp(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safetyToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safetyCalendarAge(date) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const backupUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((todayUtc - backupUtc) / 86400000));
}

function renderSafetyCenter() {
  const lastBackup = safetyValidTimestamp(safetyGetItem(LAST_BACKUP_KEY));
  const lastChange = safetyValidTimestamp(safetyGetItem(LAST_CHANGE_KEY));
  const today = safetyToday();
  const hasTodayExpense = expenses.some(expense => expense.date === today);
  const hasTodayDiary = diaryEntries.some(entry => entry.date === today);
  const hasAnyData = expenses.length > 0 || diaryEntries.length > 0;
  const hasUnbackedChanges = hasAnyData && (!lastBackup || !lastChange || lastChange > lastBackup);

  safetyElement("#todayExpenseStatus").textContent = hasTodayExpense ? "是" : "否";
  safetyElement("#todayDiaryStatus").textContent = hasTodayDiary ? "是" : "否";
  safetyElement("#unbackedNotice").hidden = !hasUnbackedChanges;

  if (!lastBackup) {
    safetyElement("#lastBackupTime").textContent = "尚未備份";
    safetyElement("#backupAge").textContent = "—";
    safetyElement("#backupStatus").textContent = "🔴 立即備份";
    return;
  }

  const age = safetyCalendarAge(lastBackup);
  safetyElement("#lastBackupTime").textContent = new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(lastBackup);
  safetyElement("#backupAge").textContent = age === 0 ? "今天" : `${age} 天`;
  safetyElement("#backupStatus").textContent = age <= 4
    ? "🟢 已備份"
    : age <= 9 ? "🟡 建議備份" : "🔴 立即備份";
}

function safetyDownload(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

safetyElement("#backupTravelData").addEventListener("click", () => {
  const now = new Date();
  const budget = validBudget(safetyElement("#budgetLimit").value) || DEFAULT_BUDGET;
  const backup = {
    version: TRAVEL_BACKUP_VERSION,
    type: TRAVEL_BACKUP_TYPE,
    backedUpAt: now.toISOString(),
    budget,
    expenses,
    diaryEntries
  };
  safetyDownload(`camino-backup-${safetyToday()}.json`, JSON.stringify(backup, null, 2));
  const timestamp = now.toISOString();
  safetySetItem(LAST_BACKUP_KEY, timestamp);
  safetySetItem(LAST_CHANGE_KEY, timestamp);
  renderSafetyCenter();
});

function safetyRestoreStorage(nextExpenses, nextBudget, nextDiary, backedUpAt) {
  const keys = [STORAGE_KEY, BUDGET_KEY, DIARY_STORAGE_KEY, LAST_BACKUP_KEY, LAST_CHANGE_KEY];
  const previous = new Map();
  try {
    const serializedExpenses = JSON.stringify(nextExpenses);
    const serializedDiary = JSON.stringify(nextDiary);
    const estimatedBytes = serializedByteSize(serializedExpenses) + serializedByteSize(serializedDiary);
    if (estimatedBytes > DIARY_STORAGE_WARNING_BYTES) throw new Error("restore-too-large");
    keys.forEach(key => previous.set(key, localStorage.getItem(key)));
    localStorage.setItem(STORAGE_KEY, serializedExpenses);
    localStorage.setItem(BUDGET_KEY, String(nextBudget));
    localStorage.setItem(DIARY_STORAGE_KEY, serializedDiary);
    localStorage.setItem(LAST_BACKUP_KEY, backedUpAt);
    localStorage.setItem(LAST_CHANGE_KEY, backedUpAt);
    return true;
  } catch {
    try {
      keys.forEach(key => {
        const value = previous.get(key);
        if (value === null) localStorage.removeItem(key);
        else if (value !== undefined) localStorage.setItem(key, value);
      });
    } catch {
      // Storage access is unavailable; keep the current in-memory data unchanged.
    }
    safetyShowMessage("照片或日記資料太大，無法儲存在此裝置。請先備份，或改用較小的照片。");
    return false;
  }
}

safetyElement("#restoreTravelData").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("備份必須是物件格式");
    if (parsed.version !== TRAVEL_BACKUP_VERSION || parsed.type !== TRAVEL_BACKUP_TYPE) throw new Error("備份版本或類型不受支援");
    const restoredBudget = typeof parsed.budget === "number" ? validBudget(parsed.budget) : null;
    if (restoredBudget === null) throw new Error("預算格式無效");
    const budgetExists = [...safetyElement("#budgetLimit").options].some(option => Number(option.value) === restoredBudget);
    if (!budgetExists) throw new Error("預算不在網站提供的選項中");
    const restoredExpenses = validateExpenses(parsed.expenses, true);
    const restoredDiary = validateDiaryEntries(parsed.diaryEntries, true);
    const restoredBackupTime = safetyValidTimestamp(parsed.backedUpAt);
    if (!restoredBackupTime) throw new Error("備份時間無效");

    const warning = `目前共有 ${expenses.length} 筆支出、${diaryEntries.length} 篇日記。\n\n還原會覆蓋目前瀏覽器中的旅行資料，確定繼續嗎？`;
    if (!confirm(warning)) return;
    if (!safetyRestoreStorage(restoredExpenses, restoredBudget, restoredDiary, restoredBackupTime.toISOString())) {
      throw new Error("瀏覽器無法完整儲存還原資料");
    }

    expenses = restoredExpenses;
    diaryEntries = restoredDiary;
    safetyElement("#budgetLimit").value = String(restoredBudget);
    if (typeof resetTodayRecordForm === "function") resetTodayRecordForm();
    render();
    renderDiaryEntries();
    renderSafetyCenter();
    alert("支出、預算與日記已還原。");
  } catch (error) {
    alert(`無法還原旅行資料：${error instanceof Error ? error.message : "格式錯誤"}。現有資料未變更。`);
  } finally {
    event.target.value = "";
  }
});

window.addEventListener("camino:data-changed", renderSafetyCenter);
renderSafetyCenter();
