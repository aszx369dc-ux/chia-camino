function todayElement(selector) {
  return document.querySelector(selector);
}

function renderNetworkStatus() {
  const online = navigator.onLine;
  const container = todayElement("#networkStatus");
  container.classList.toggle("is-offline", !online);
  todayElement("#networkStatusTitle").textContent = online ? "🌐 已連線" : "🟢 離線模式";
  todayElement("#networkStatusDetail").hidden = online;
}

window.addEventListener("online", renderNetworkStatus);
window.addEventListener("offline", renderNetworkStatus);

function showTodayRecordMessage(message, isError = false) {
  const element = todayElement("#todayRecordMessage");
  element.textContent = message;
  element.hidden = false;
  element.style.background = isError ? "#f8e5e2" : "#dce9df";
  element.style.color = isError ? "#71332e" : "#17342b";
}

const todayPhotoController = createPhotoController("today", message => showTodayRecordMessage(message, true));

function buildTodayRecordEntry() {
  return {
    id: todayElement("#todayEditId").value || diaryCreateId(),
    date: todayElement("#todayDate").value,
    day: Number(todayElement("#todayDay").value),
    start: todayElement("#todayStart").value,
    end: todayElement("#todayEnd").value,
    distance: Number(todayElement("#todayDistance").value),
    mood: todayElement("#todayMood").value,
    weather: todayElement("#todayWeather").value,
    people: todayElement("#todayPeople").value,
    events: todayElement("#todayEvents").value,
    quote: todayElement("#todayQuote").value,
    tomorrow: todayElement("#todayTomorrow").value,
    content: todayElement("#todayContent").value,
    photo: todayPhotoController.getPhoto()
  };
}

function resetTodayRecordForm() {
  todayElement("#todayRecordForm").reset();
  todayElement("#todayEditId").value = "";
  todayElement("#todayDate").valueAsDate = new Date();
  todayElement("#todayEditStatus").hidden = true;
  todayElement("#todayEditStatus").textContent = "";
  todayElement("#completeToday").textContent = "完成今天";
  todayElement("#cancelTodayEdit").hidden = true;
  todayPhotoController.reset();
}

function beginTodayRecordEdit(id) {
  const entry = diaryEntries.find(item => item.id === id);
  if (!entry) return;
  todayElement("#todayEditId").value = entry.id;
  todayElement("#todayDate").value = entry.date;
  todayElement("#todayDay").value = String(entry.day);
  todayElement("#todayStart").value = entry.start;
  todayElement("#todayEnd").value = entry.end;
  todayElement("#todayDistance").value = String(entry.distance);
  todayElement("#todayMood").value = entry.mood;
  todayElement("#todayWeather").value = entry.weather;
  todayElement("#todayPeople").value = entry.people;
  todayElement("#todayEvents").value = entry.events;
  todayElement("#todayQuote").value = entry.quote;
  todayElement("#todayTomorrow").value = entry.tomorrow;
  todayElement("#todayContent").value = entry.content;
  todayPhotoController.setPhoto(entry.photo);
  todayElement("#todayEditStatus").textContent = `正在編輯 Day ${entry.day}`;
  todayElement("#todayEditStatus").hidden = false;
  todayElement("#completeToday").textContent = "儲存修改";
  todayElement("#cancelTodayEdit").hidden = false;
  todayElement("#todayRecordPanel").open = true;
  todayElement("#todayRecord").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelTodayRecordEdit(expectedId) {
  const editingId = todayElement("#todayEditId").value;
  if (expectedId && editingId !== expectedId) return;
  resetTodayRecordForm();
}

function hasUnbackedTravelChanges() {
  const lastBackup = safetyValidTimestamp(safetyGetItem(LAST_BACKUP_KEY));
  const lastChange = safetyValidTimestamp(safetyGetItem(LAST_CHANGE_KEY));
  return !lastBackup || !lastChange || lastChange > lastBackup;
}

todayElement("#todayRecordForm").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const entry = validateDiaryEntries([buildTodayRecordEntry()], false)[0];
    const editingId = todayElement("#todayEditId").value;
    if (editingId && !diaryEntries.some(item => item.id === editingId)) throw new Error("找不到要編輯的日記，請重新載入頁面");

    const sameDateExists = diaryEntries.some(item => item.date === entry.date && item.id !== editingId);
    if (sameDateExists && !confirm("這一天已經有日記。繼續會再保留一篇同日期日記，是否繼續？")) return;

    const nextEntries = editingId
      ? diaryEntries.map(item => item.id === editingId ? entry : item)
      : [...diaryEntries, entry];
    if (!saveDiaryEntries(nextEntries)) {
      showTodayRecordMessage("照片或日記資料太大，無法儲存在此裝置。請先備份，或改用較小的照片。", true);
      return;
    }

    resetTodayRecordForm();
    renderDiaryEntries();
    renderSafetyCenter();
    const reminder = hasUnbackedTravelChanges() ? "\n記得在有網路時備份旅行資料。" : "";
    showTodayRecordMessage(editingId ? `日記修改已保存。${reminder}` : `今天的故事已保存。${reminder}`);
  } catch (error) {
    showTodayRecordMessage(error instanceof Error ? error.message : "無法保存今天的故事", true);
  }
});

todayElement("#cancelTodayEdit").addEventListener("click", () => cancelTodayRecordEdit());

renderNetworkStatus();
resetTodayRecordForm();
