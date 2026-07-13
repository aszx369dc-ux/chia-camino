const DIARY_STORAGE_KEY = "chia-camino-diary-v1";
const DIARY_BACKUP_VERSION = 1;
const DIARY_BACKUP_TYPE = "camino-diary";
const DIARY_MOODS = ["😀 開心", "😌 平靜", "🤩 驚喜", "😭 難過", "😤 挫折", "😴 疲憊"];
const DIARY_WEATHER = ["晴天", "陰天", "下雨", "炎熱", "寒冷", "強風"];
const diaryFieldLimits = {
  start: 80,
  end: 80,
  people: 500,
  events: 2000,
  quote: 300,
  tomorrow: 1000,
  content: 5000
};

let diaryEntries = loadDiaryEntries();

function diaryElement(selector) {
  return document.querySelector(selector);
}

function diaryCreateId() {
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

function showDiaryMessage(message) {
  const element = diaryElement("#diaryMessage");
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
}

function diarySafeGet() {
  try {
    return { ok: true, value: localStorage.getItem(DIARY_STORAGE_KEY) };
  } catch {
    return { ok: false, value: null };
  }
}

function diarySafeSet(value) {
  try {
    localStorage.setItem(DIARY_STORAGE_KEY, value);
    return true;
  } catch {
    showDiaryMessage("照片或日記資料太大，無法儲存在此裝置。請先備份，或改用較小的照片。");
    return false;
  }
}

function diaryIsValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function diaryValidateText(entry, field, label, required = false) {
  const value = entry[field];
  if (typeof value !== "string") throw new Error(`${label}必須是字串`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${label}不可空白`);
  if (value.length > diaryFieldLimits[field]) throw new Error(`${label}超過 ${diaryFieldLimits[field]} 字`);
  return required ? trimmed : value;
}

function validateDiaryEntries(value, regenerateIds) {
  if (!Array.isArray(value)) throw new Error("entries 必須是陣列");
  return value.map((entry, index) => {
    const label = `第 ${index + 1} 篇日記：`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`${label}內容不是物件`);
    if (typeof entry.id !== "string" || !entry.id.trim()) throw new Error(`${label}id 必須是非空白字串`);
    if (!diaryIsValidDate(entry.date)) throw new Error(`${label}日期無效`);
    if (!Number.isInteger(entry.day) || entry.day < 1 || entry.day > 999) throw new Error(`${label}Day 必須是 1 至 999 的整數`);
    if (typeof entry.distance !== "number" || !Number.isFinite(entry.distance) || entry.distance < 0 || entry.distance > 200) {
      throw new Error(`${label}公里數必須是 0 至 200 的有限數字`);
    }
    if (!DIARY_MOODS.includes(entry.mood)) throw new Error(`${label}心情選項無效`);
    if (!DIARY_WEATHER.includes(entry.weather)) throw new Error(`${label}天氣選項無效`);
    return {
      id: regenerateIds ? diaryCreateId() : entry.id,
      date: entry.date,
      day: entry.day,
      start: diaryValidateText(entry, "start", `${label}起點`, true),
      end: diaryValidateText(entry, "end", `${label}終點`, true),
      distance: entry.distance,
      mood: entry.mood,
      weather: entry.weather,
      people: diaryValidateText(entry, "people", `${label}今日遇見的人`),
      events: diaryValidateText(entry, "events", `${label}今日發生的事`),
      quote: diaryValidateText(entry, "quote", `${label}最深刻的一句話`),
      tomorrow: diaryValidateText(entry, "tomorrow", `${label}給明天的自己`),
      content: diaryValidateText(entry, "content", `${label}自由日記`),
      photo: validateDiaryPhoto(entry.photo, `${label}照片`)
    };
  });
}

function loadDiaryEntries() {
  const result = diarySafeGet();
  if (!result.ok) {
    showDiaryMessage("瀏覽器目前無法讀取本機日記；本次內容可能無法保存。");
    return [];
  }
  if (result.value === null) return [];
  try {
    return validateDiaryEntries(JSON.parse(result.value), true);
  } catch {
    showDiaryMessage("已儲存的日記資料格式損毀，因此暫時顯示空白日記列表。原始資料不會被覆蓋或刪除。");
    return [];
  }
}

function saveDiaryEntries(nextEntries) {
  const serialized = JSON.stringify(nextEntries);
  const estimatedBytes = serializedByteSize(serialized);
  if (estimatedBytes > DIARY_STORAGE_WARNING_BYTES) {
    showDiaryMessage("照片或日記資料太大，無法儲存在此裝置。請先備份，或改用較小的照片。");
    return false;
  }
  if (!diarySafeSet(serialized)) return false;
  diaryEntries = nextEntries;
  if (typeof markCaminoDataChanged === "function") markCaminoDataChanged();
  return true;
}

function appendDiaryField(container, title, value, wide = true) {
  const field = document.createElement("section");
  field.className = wide ? "diary-field diary-field-wide" : "diary-field";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = value || "—";
  field.append(heading, paragraph);
  container.append(field);
}

function renderDiaryEntries() {
  const container = diaryElement("#diaryEntries");
  container.replaceChildren();
  const sorted = [...diaryEntries].sort((a, b) => b.date.localeCompare(a.date) || b.day - a.day);
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "diary-empty";
    empty.textContent = "還沒有旅行日誌。完成今天的紀錄後，它會出現在這裡。";
    container.append(empty);
    return;
  }

  sorted.forEach(entry => {
    const card = document.createElement("details");
    card.className = "diary-card";
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.className = "diary-summary-title";
    title.textContent = `Day ${entry.day}｜${entry.date}`;
    const meta = document.createElement("span");
    meta.className = "diary-summary-meta";
    meta.textContent = `${entry.start} → ${entry.end} · ${entry.distance} km · ${entry.mood}`;
    const summaryText = document.createElement("span");
    summaryText.className = "diary-summary-text";
    summaryText.append(title, meta);
    summary.append(summaryText);
    if (entry.photo) {
      const thumbnail = document.createElement("img");
      thumbnail.className = "diary-thumbnail";
      thumbnail.src = validateDiaryPhoto(entry.photo).dataUrl;
      thumbnail.alt = "此篇日記的照片縮圖";
      summary.append(thumbnail);
    }

    const detail = document.createElement("div");
    detail.className = "diary-detail";
    const grid = document.createElement("div");
    grid.className = "diary-detail-grid";
    appendDiaryField(grid, "路線", `${entry.start} → ${entry.end}`, false);
    appendDiaryField(grid, "公里數／心情／天氣", `${entry.distance} km · ${entry.mood} · ${entry.weather}`, false);
    appendDiaryField(grid, "今日遇見的人", entry.people);
    appendDiaryField(grid, "今日發生的事", entry.events);
    appendDiaryField(grid, "今天最深刻的一句話", entry.quote);
    appendDiaryField(grid, "給明天的自己", entry.tomorrow);
    appendDiaryField(grid, "日記", entry.content);
    if (entry.photo) {
      const photoSection = document.createElement("section");
      photoSection.className = "diary-field diary-field-wide diary-photo-detail";
      const heading = document.createElement("h3");
      heading.textContent = "今天的一張照片";
      const photo = document.createElement("img");
      photo.src = validateDiaryPhoto(entry.photo).dataUrl;
      photo.alt = `Day ${entry.day} 日記照片`;
      photoSection.append(heading, photo);
      grid.append(photoSection);
    }

    const actions = document.createElement("div");
    actions.className = "diary-card-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.dataset.id = entry.id;
    editButton.textContent = "編輯";
    editButton.addEventListener("click", () => beginTodayRecordEdit(editButton.dataset.id));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "diary-delete";
    deleteButton.dataset.id = entry.id;
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", () => deleteDiaryEntry(deleteButton.dataset.id));
    actions.append(editButton, deleteButton);
    detail.append(grid, actions);
    card.append(summary, detail);
    container.append(card);
  });
}

function deleteDiaryEntry(id) {
  const entry = diaryEntries.find(item => item.id === id);
  if (!entry || !confirm(`確定刪除 Day ${entry.day} 的日記嗎？`)) return;
  const nextEntries = diaryEntries.filter(item => item.id !== id);
  if (saveDiaryEntries(nextEntries)) {
    if (typeof cancelTodayRecordEdit === "function") cancelTodayRecordEdit(id);
    renderDiaryEntries();
  }
}

diaryElement("#exportDiaryJson").addEventListener("click", () => {
  const backup = { version: DIARY_BACKUP_VERSION, type: DIARY_BACKUP_TYPE, entries: diaryEntries };
  diaryDownload(`camino-diary-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
});

diaryElement("#importDiaryJson").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("備份內容必須是物件");
    if (parsed.version !== DIARY_BACKUP_VERSION) throw new Error("備份版本不受支援");
    if (parsed.type !== DIARY_BACKUP_TYPE) throw new Error("這不是 Camino 日記備份");
    const imported = validateDiaryEntries(parsed.entries, true);
    const serialized = JSON.stringify(imported);
    if (serializedByteSize(serialized) > DIARY_STORAGE_WARNING_BYTES || !diarySafeSet(serialized)) {
      throw new Error("照片或日記資料太大，無法儲存在此裝置。請先備份，或改用較小的照片");
    }
    diaryEntries = imported;
    if (typeof markCaminoDataChanged === "function") markCaminoDataChanged();
    if (typeof resetTodayRecordForm === "function") resetTodayRecordForm();
    renderDiaryEntries();
    alert("日記備份已驗證並還原。");
  } catch (error) {
    alert(`無法還原日記：${error instanceof Error ? error.message : "格式錯誤"}。現有日記未變更。`);
  }
  event.target.value = "";
});

function diaryMarkdownSection(title, value) {
  return `## ${title}\n${value || "—"}\n`;
}

function diaryMarkdown() {
  return [...diaryEntries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day)
    .map(entry => [
      `# Day ${entry.day}｜${entry.date}`,
      `**路線：** ${entry.start} → ${entry.end}  `,
      `**公里數：** ${entry.distance} km  `,
      `**心情：** ${entry.mood}  `,
      `**天氣：** ${entry.weather}  `,
      entry.photo ? "**照片：** 此篇日記包含一張照片（照片保存在 JSON 備份中）  " : "",
      diaryMarkdownSection("今日遇見的人", entry.people),
      diaryMarkdownSection("今日發生的事", entry.events),
      diaryMarkdownSection("今天最深刻的一句話", entry.quote),
      diaryMarkdownSection("給明天的自己", entry.tomorrow),
      diaryMarkdownSection("日記", entry.content)
    ].join("\n"))
    .join("\n---\n\n");
}

diaryElement("#exportDiaryMarkdown").addEventListener("click", () => {
  diaryDownload(`camino-diary-${new Date().toISOString().slice(0, 10)}.md`, diaryMarkdown(), "text/markdown;charset=utf-8");
});

function diaryDownload(filename, content, type) {
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

renderDiaryEntries();
