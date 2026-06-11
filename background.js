const DEFAULT_SETTINGS = {
  mode: "Smart",
  enabled: true,
  countdownRules: {
    monday: "19:30",
    tuesday: "19:30",
    wednesday: "17:30",
    thursday: "17:30",
    friday: "17:30",
    saturday: "17:30",
    sunday: "17:30"
  },
  showSmartPopup: true,
  autoSaveStatus: true,
  userName: "",
  userContact: "",
  lmAddress: "Hello AI assistant,",
  privacyPolicyUrl: "https://j03.page/privacy-policy-for-membership13-research-log/"
};

async function getSettings() {
  const data = await chrome.storage.local.get(["rmgSettings"]);
  return Object.assign({}, DEFAULT_SETTINGS, data.rmgSettings || {});
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["rmgSettings", "rmgCustomRecords", "rmgStatus"]);
  if (!data.rmgSettings) await chrome.storage.local.set({ rmgSettings: DEFAULT_SETTINGS });
  if (!data.rmgCustomRecords) await chrome.storage.local.set({ rmgCustomRecords: [] });
  if (!data.rmgStatus) await chrome.storage.local.set({ rmgStatus: {} });
  chrome.alarms.create("researchMemoryGuidePulse", { periodInMinutes: 5 });
});

function targetForDate(now, rules) {
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = names[now.getDay()];
  const value = (rules && rules[day]) || "17:30";
  const [h, m] = value.split(":").map(Number);
  const target = new Date(now);
  target.setHours(Number.isFinite(h) ? h : 17, Number.isFinite(m) ? m : 30, 0, 0);
  return { day, value, target };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "researchMemoryGuidePulse") return;
  const settings = await getSettings();
  if (!settings.enabled) return;
  const now = new Date();
  const target = targetForDate(now, settings.countdownRules);
  const min = Math.floor((target.target - now) / 60000);
  if (min >= 0 && min <= 15) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "Research Memory Guide",
      message: "You are close to your research checkpoint. Consider sharing where you are researching and what evidence you found."
    });
  }
});
