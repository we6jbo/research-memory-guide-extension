const DEFAULT_SETTINGS = {
  mode: "Smart",
  enabled: true,
  countdownRules: { monday: "19:30", tuesday: "19:30", wednesday: "17:30", thursday: "17:30", friday: "17:30", saturday: "17:30", sunday: "17:30" },
  showSmartPopup: true,
  helperPinned: true,
  autoSaveStatus: true,
  autoSaveJson: true,
  autoSaveJsonMinutes: 20,
  userName: "",
  userContact: "",
  lmAddress: "Hello AI assistant,",
  privacyPolicyUrl: "https://j03.page/privacy-policy-for-membership13-research-log/"
};
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
let settings = DEFAULT_SETTINGS;
let lastDiagnostic = null;

function $(id) { return document.getElementById(id); }
function storageGet(keys) { return new Promise(resolve => chrome.storage.local.get(keys, resolve)); }
function storageSet(obj) { return new Promise(resolve => chrome.storage.local.set(obj, resolve)); }

function targetForDate(now) {
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = names[now.getDay()];
  const value = (settings.countdownRules && settings.countdownRules[day]) || "17:30";
  const [h, m] = value.split(":").map(Number);
  const target = new Date(now);
  target.setHours(Number.isFinite(h) ? h : 17, Number.isFinite(m) ? m : 30, 0, 0);
  return { day, value, target };
}

function updateTime() {
  const now = new Date();
  const t = targetForDate(now);
  const diffMin = Math.max(0, Math.floor((t.target - now) / 60000));
  $("timeBox").textContent = `Local time: ${now.toLocaleTimeString()} | Time until ${t.value}: ${diffMin} minutes`;
  $("timeBox").className = diffMin <= 15 ? "bad" : diffMin <= 30 ? "warn" : "good";
}
setInterval(updateTime, 1000);

function applyMode() {
  const mode = $("mode").value;
  for (const id of ["smartPanel", "manualPanel", "advancedPanel", "developerPanel"]) $(id).classList.add("hidden");
  if (mode === "Smart") $("smartPanel").classList.remove("hidden");
  if (mode === "Manual") { $("smartPanel").classList.remove("hidden"); $("manualPanel").classList.remove("hidden"); }
  if (mode === "Advanced") { $("smartPanel").classList.remove("hidden"); $("manualPanel").classList.remove("hidden"); $("advancedPanel").classList.remove("hidden"); }
  if (mode === "Developer") { $("smartPanel").classList.remove("hidden"); $("manualPanel").classList.remove("hidden"); $("advancedPanel").classList.remove("hidden"); $("developerPanel").classList.remove("hidden"); }
}

async function loadSettings() {
  const data = await storageGet(["rmgSettings", "rmgCustomRecords", "rmgLastDiagnostic"]);
  settings = Object.assign({}, DEFAULT_SETTINGS, data.rmgSettings || {});
  settings.countdownRules = Object.assign({}, DEFAULT_SETTINGS.countdownRules, settings.countdownRules || {});
  $("mode").value = settings.mode || "Smart";
  $("enabled").checked = settings.enabled !== false;
  $("showSmartPopup").checked = settings.showSmartPopup !== false;
  $("helperPinned").checked = settings.helperPinned !== false;
  $("autoSaveStatus").checked = settings.autoSaveStatus !== false;
  $("autoSaveJson").checked = settings.autoSaveJson !== false;
  $("autoSaveJsonMinutes").value = Number(settings.autoSaveJsonMinutes) || 20;
  $("userName").value = settings.userName || "";
  $("userContact").value = settings.userContact || "";
  $("lmAddress").value = settings.lmAddress || "Hello AI assistant,";
  days.forEach(day => $(day).value = settings.countdownRules[day] || DEFAULT_SETTINGS.countdownRules[day]);
  $("jsonEditor").value = JSON.stringify(data.rmgCustomRecords || [], null, 2);
  lastDiagnostic = data.rmgLastDiagnostic || null;
  applyMode();
  updateTime();
}

async function saveSettings() {
  settings.mode = $("mode").value;
  settings.enabled = $("enabled").checked;
  settings.showSmartPopup = $("showSmartPopup").checked;
  settings.helperPinned = $("helperPinned").checked;
  settings.autoSaveStatus = $("autoSaveStatus").checked;
  settings.autoSaveJson = $("autoSaveJson").checked;
  settings.autoSaveJsonMinutes = Math.max(1, Number($("autoSaveJsonMinutes").value) || 20);
  settings.userName = $("userName").value.trim();
  settings.userContact = $("userContact").value.trim();
  settings.lmAddress = $("lmAddress").value.trim() || "Hello AI assistant,";
  settings.countdownRules = {};
  days.forEach(day => settings.countdownRules[day] = $(day).value || DEFAULT_SETTINGS.countdownRules[day]);
  await storageSet({ rmgSettings: settings });
  $("status").className = "good";
  $("status").textContent = "Settings saved.";
  updateTime();
}

async function getDiag() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return null;
  try {
    const d = await chrome.tabs.sendMessage(tab.id, { type: "GET_DIAGNOSTIC" });
    lastDiagnostic = d;
    await storageSet({ rmgLastDiagnostic: d });
    return d;
  } catch (e) {
    return {
      canReadPage: false,
      error: String(e && e.message ? e.message : e),
      url: tab.url || "",
      title: tab.title || "",
      matchedKeywords: [],
      evidence: [],
      completion: { score: 0, reasons: [] },
      nextStep: "The extension could not read this page. Refresh the page or open a normal website page.",
      excerpt: "",
      savedLog: { matches: [], bundledRecordCount: 0, customRecordCount: 0 },
      shareText: "The extension could not read this page. Refresh and try again."
    };
  }
}

function shortMatches(d) {
  const matches = (d.savedLog && d.savedLog.matches) || [];
  if (!matches.length) return "No saved log loaded for this site yet.";
  if ($("mode").value === "Advanced" || $("mode").value === "Developer") {
    return "Saved log loaded for this site:\n" + matches.slice(0, 3).map((r, i) => `${i + 1}. ${r.source_title || r.source_url} | ${(r.evidence_flags || []).join(", ") || "saved record"} | ${r.next_step_at_capture || "Saved clue."}`).join("\n");
  }
  return `Saved log loaded for this site. I found ${matches.length} saved clue(s). This page may help with genealogy, baptism/church records, religious memory, culture, or identity research. ${d.nextStep}`.slice(0, 130);
}

async function refreshAutoStatus() {
  const d = await getDiag();
  const lines = [];
  lines.push(`Can read page: ${d.canReadPage}`);
  lines.push(`Title: ${d.title}`);
  lines.push(`Evidence: ${(d.evidence || []).join(" | ") || "none yet"}`);
  lines.push(`Completion estimate: ${(d.completion && d.completion.score) || 0}%`);
  lines.push(`Next: ${d.nextStep}`);
  lines.push(shortMatches(d));
  $("autoStatus").textContent = lines.join("\n");
  $("scoreBox").textContent = `Completion estimate: ${(d.completion && d.completion.score) || 0}% toward the research identity checkpoint`;
  $("sharePreview").value = d.shareText || "";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    $("status").className = "good";
    $("status").textContent = "Copy text to share saved to clipboard.";
  } catch {
    $("status").className = "bad";
    $("status").textContent = "Copy failed. Select the text manually and press Ctrl+C.";
  }
}

async function saveEditorJsonSilently(showMessage = false) {
  try {
    const parsed = JSON.parse($("jsonEditor").value || "[]");
    if (!Array.isArray(parsed)) throw new Error("JSON must be an array of records.");
    await storageSet({ rmgCustomRecords: parsed, rmgLastJsonAutoSaveAt: new Date().toISOString() });
    if (showMessage) {
      $("status").className = "good";
      $("status").textContent = "JSON records saved locally.";
    }
    return true;
  } catch (e) {
    if (showMessage) {
      $("status").className = "bad";
      $("status").textContent = "JSON save failed: " + e.message;
    }
    return false;
  }
}

async function autoSaveEditorJsonIfEnabled() {
  await saveSettings();
  if (settings.autoSaveJson === false) return;
  await saveEditorJsonSilently(false);
}

$("mode").addEventListener("change", async () => { applyMode(); await saveSettings(); });
$("saveSettings").onclick = saveSettings;
$("refreshStatus").onclick = refreshAutoStatus;
$("refreshSlow").onclick = refreshAutoStatus;
$("showOverlay").onclick = async () => {
  await storageSet({ rmgHelperHiddenByUser: false });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) await chrome.tabs.sendMessage(tab.id, { type: "SHOW_SMART_OVERLAY" });
  $("status").className = "good";
  $("status").textContent = "Lower-right helper is pinned open again.";
};
$("hideOverlay").onclick = async () => {
  await storageSet({ rmgHelperHiddenByUser: true });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    try { await chrome.tabs.sendMessage(tab.id, { type: "HIDE_SMART_OVERLAY" }); } catch {}
  }
  $("status").className = "warn";
  $("status").textContent = "Lower-right helper hidden until you show it again.";
};
$("saveCurrentPage").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    const rec = await chrome.tabs.sendMessage(tab.id, { type: "SAVE_CURRENT_PAGE" });
    const data = await storageGet(["rmgCustomRecords"]);
    $("jsonEditor").value = JSON.stringify(data.rmgCustomRecords || [], null, 2);
    $("status").className = "good";
    $("status").textContent = `Saved current page to JSON: ${rec.source_title || rec.source_url}`;
  }
};
$("addSite").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    const rec = await chrome.tabs.sendMessage(tab.id, { type: "ADD_CURRENT_SITE" });
    const data = await storageGet(["rmgCustomRecords"]);
    $("jsonEditor").value = JSON.stringify(data.rmgCustomRecords || [], null, 2);
    $("status").className = "good";
    $("status").textContent = `Added site to JSON and autosaved locally: ${rec.source_title || rec.source_url}`;
  }
};
$("copyShare").onclick = async () => {
  await saveSettings();
  const d = await getDiag();
  $("sharePreview").value = d.shareText || "";
  await copyText(d.shareText || "");
};
$("saveJson").onclick = async () => {
  await saveEditorJsonSilently(true);
};
$("exportJson").onclick = async () => {
  const data = await storageGet(["rmgCustomRecords"]);
  await copyText(JSON.stringify({ schema: "membership13.researchlog.v1", exported_at_iso: new Date().toISOString(), records: data.rmgCustomRecords || [] }, null, 2));
};
$("doneBtn").onclick = async () => {
  const d = lastDiagnostic || await getDiag();
  const score = (d.completion && d.completion.score) || 0;
  if (score >= 85) {
    $("status").className = "good";
    $("status").textContent = "Research checkpoint looks complete. Save your local JSON and share only what you are comfortable sharing.";
  } else {
    $("status").className = "warn";
    $("status").textContent = `Not complete yet. Current estimate is ${score}%. ${d.nextStep}`;
  }
};
$("copyDevPlan").onclick = async () => {
  const text = `Future expansion ideas for Research Memory Guide:
1. Keep local-first JSON records as the default.
2. Add optional import/export for JSON backups.
3. Add optional language-model integration only after clear consent.
4. Let the user choose their own model, such as ChatGPT, Google AI, a local LLM, or another LM.
5. Use a future LM only to summarize pages, suggest next steps, and classify evidence. Do not upload private notes by default.
6. Keep Smart, Manual, Advanced, and Developer modes separate so nontechnical users are not shown JSON editors.
7. Public source target: https://github.com/we6jbo/research-memory-guide-extension`;
  $("devNotes").value = text;
  await copyText(text);
};
$("aboutBtn").onclick = () => {
  const box = $("aboutBox");
  box.classList.toggle("hidden");
  box.textContent = "Research Memory Guide was made on 6/11/2026 by Jeremiah O'Neal aka we6jbo. It was made to help people save local research evidence, recognize useful pages, copy shareable prompts for any language model, and track progress toward a research identity checkpoint without forcing users to expose private notes.";
};

for (const id of ["enabled", "showSmartPopup", "helperPinned", "autoSaveStatus", "autoSaveJson", "autoSaveJsonMinutes", "userName", "userContact", "lmAddress", ...days]) {
  $(id).addEventListener("change", saveSettings);
}

let jsonEditTimer = null;
$("jsonEditor").addEventListener("input", () => {
  if (jsonEditTimer) clearTimeout(jsonEditTimer);
  jsonEditTimer = setTimeout(autoSaveEditorJsonIfEnabled, 1200);
});

setInterval(() => {
  if (settings.autoSaveJson !== false) saveEditorJsonSilently(false);
}, Math.max(1, Number(settings.autoSaveJsonMinutes) || 20) * 60000);

loadSettings().then(refreshAutoStatus);
