(function () {
  if (window.__researchMemoryGuideLoaded) return;
  window.__researchMemoryGuideLoaded = true;

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

  let bundledResearchLog = null;
  let bundledResearchRecords = [];
  let bundledResearchLoadError = "";
  let currentSettings = DEFAULT_SETTINGS;
  let customRecords = [];
  let helperHiddenByUser = false;
  let lastOverlayDiagnostic = null;

  const safeText = (value) => String(value || "")
    .replace(/Clairemont Branch Library/gi, "a local library or research location")
    .replace(/2920 Burgener Blvd, San Diego, CA 92110/gi, "")
    .replace(/Clairemont/gi, "local research")
    .replace(/membership13/gi, "the research identity project")
    .replace(/Part A/gi, "research checkpoint")
    .replace(/part a/gi, "research checkpoint");

  async function loadBundledResearchLog() {
    if (bundledResearchLog || bundledResearchLoadError) return;
    try {
      const url = chrome.runtime.getURL("membership13_researchlog.json");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bundledResearchLog = await res.json();
      bundledResearchRecords = Array.isArray(bundledResearchLog.records) ? bundledResearchLog.records : [];
    } catch (e) {
      bundledResearchLoadError = String(e && e.message ? e.message : e);
      bundledResearchRecords = [];
    }
  }

  function getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }
  function setStorage(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
  }
  async function loadSettingsAndRecords() {
    const data = await getStorage(["rmgSettings", "rmgCustomRecords", "rmgHelperHiddenByUser"]);
    currentSettings = Object.assign({}, DEFAULT_SETTINGS, data.rmgSettings || {});
    customRecords = Array.isArray(data.rmgCustomRecords) ? data.rmgCustomRecords : [];
    helperHiddenByUser = data.rmgHelperHiddenByUser === true;
  }

  function normalizeUrlForMatch(value) {
    try {
      const u = new URL(value);
      u.hash = "";
      return u.toString().replace(/\/$/, "");
    } catch {
      return String(value || "").replace(/#.*$/, "").replace(/\/$/, "");
    }
  }

  function allRecords() {
    return [...bundledResearchRecords, ...customRecords];
  }

  function recordsMatchingCurrentPage(limit = 8) {
    const current = normalizeUrlForMatch(location.href);
    const host = location.hostname.replace(/^www\./, "").toLowerCase();
    const path = location.pathname.replace(/\/$/, "");
    return allRecords().filter(r => {
      const recUrl = normalizeUrlForMatch(r.source_url || r.url || "");
      let recHost = String(r.source_domain || r.domain || "").replace(/^www\./, "").toLowerCase();
      if (!recHost && recUrl) {
        try { recHost = new URL(recUrl).hostname.replace(/^www\./, "").toLowerCase(); } catch {}
      }
      let recPath = "";
      try { recPath = new URL(recUrl).pathname.replace(/\/$/, ""); } catch {}
      if (recUrl && current === recUrl) return true;
      if (recHost && host === recHost && recPath && path === recPath) return true;
      if (recHost && host === recHost && (r.match_domain_only || /ancestrylibrary\.com|familysearch\.org|sandiego\.gov/.test(host))) return true;
      return false;
    }).slice(0, limit);
  }

  function visibleText(el) {
    if (!el) return "";
    const style = window.getComputedStyle(el);
    if (style && (style.display === "none" || style.visibility === "hidden")) return "";
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }
  function pageText() { return visibleText(document.body).slice(0, 15000); }

  function matchedKeywords(hay) {
    const checks = [
      ["genealogy resources", ["genealogy", "family history", "ancestry", "familysearch", "records catalog"]],
      ["baptism or church records", ["baptism", "baptismal", "book of baptisms", "church records", "parish records", "sacramental records"]],
      ["library or archive access", ["library", "archive", "special collections", "microfilm", "catalog"]],
      ["religious memory or identity", ["religious tradition", "baptized", "baptismal identity", "church membership", "humanism", "culture"]]
    ];
    return checks.filter(([name, words]) => words.some(w => hay.includes(w))).map(([name]) => name);
  }

  function evidenceFor(hay, url) {
    const evidence = [];
    if (url.includes("sandiego.gov") && hay.includes("genealogy")) evidence.push("GENEALOGY_RESOURCE");
    if (hay.includes("ancestrylibrary") || hay.includes("ancestry library edition")) evidence.push("LIBRARY_DATABASE_ACCESS");
    if (hay.includes("familysearch") || hay.includes("family search")) evidence.push("FAMILYSEARCH_RESOURCE");
    if (hay.includes("book of baptisms") || hay.includes("baptism") || hay.includes("parish records") || hay.includes("church records")) evidence.push("BAPTISM_OR_CHURCH_RECORDS");
    if (hay.includes("religious tradition") || hay.includes("baptismal identity") || hay.includes("humanism")) evidence.push("RELIGIOUS_IDENTITY_CONTEXT");
    return Array.from(new Set(evidence));
  }

  function goalCriteria() {
    return [
      "Explore religions, beliefs, and God-concepts as human-shaped ideas that emerged across human history.",
      "Consider whether childhood baptism can still matter even when later belief becomes nontraditional, cultural, or human-centered.",
      "Separate baptismal identity from active local church membership.",
      "Connect memory, genealogy, baptism, culture, and religious tradition without requiring full agreement with doctrine.",
      "Describe religious concepts as real cultural, psychological, and social forces, even when understood through humanism.",
      "Notice personal history and life events as part of how belief and identity can change.",
      "Use baptismal wording, church records, genealogy, or cultural memory as evidence for the research identity checkpoint."
    ];
  }

  function completionScore(evidence, matches) {
    let score = 0;
    const reasons = [];
    if (evidence.includes("GENEALOGY_RESOURCE") || evidence.includes("FAMILYSEARCH_RESOURCE")) { score += 25; reasons.push("genealogy or family-history resource found"); }
    if (evidence.includes("BAPTISM_OR_CHURCH_RECORDS")) { score += 30; reasons.push("baptism or church-record evidence found"); }
    if (evidence.includes("LIBRARY_DATABASE_ACCESS")) { score += 15; reasons.push("library database access found"); }
    if (evidence.includes("RELIGIOUS_IDENTITY_CONTEXT")) { score += 15; reasons.push("belief, culture, or religious-identity context found"); }
    if (matches && matches.length) { score += 15; reasons.push("saved JSON log matched this page"); }
    return { score: Math.min(100, score), reasons };
  }

  function nextStepFor(score, evidence, matches) {
    if (score >= 85) return "You are very close. Save the page result, copy a shareable summary, and mark the research checkpoint done when your checklist agrees.";
    if (!matches || !matches.length) return "Add this site to your local JSON or visit a page that matches your saved research log.";
    if (!evidence.includes("BAPTISM_OR_CHURCH_RECORDS")) return "Look for baptism, parish, church-record, membership, culture, memory, or religious-identity evidence.";
    return "Write one clear result from this page and share a short forum update about where you are researching and why it matters.";
  }

  function links() {
    return Array.from(document.querySelectorAll("a[href]")).map(a => ({ text: safeText(visibleText(a).slice(0, 120)), href: a.href }))
      .filter(x => /(genealogy|ancestry|familysearch|baptism|church|parish|records|special|collection|library|obituary|archive|mission|history|religion|humanism)/i.test(x.text + " " + x.href))
      .slice(0, 25);
  }

  function makeShareText(diagnostic) {
    const address = currentSettings.lmAddress || "Hello AI assistant,";
    const evidence = diagnostic.evidence.length ? diagnostic.evidence.join(", ") : "none detected yet";
    const matches = diagnostic.savedLog.matches.length ? diagnostic.savedLog.matches.map((r, i) => `${i + 1}. ${safeText(r.source_title || r.source_url)} | ${(r.evidence_flags || []).join(", ") || "saved record"} | ${safeText(r.next_step_at_capture || "Saved research clue.")}`).join("\n") : "No saved log match for this page yet.";
    return `${address}

I am using Research Memory Guide. Please help me understand this page as research evidence and suggest the next safe step.

Current page:
Title: ${safeText(diagnostic.title)}
URL: ${diagnostic.url}
Evidence detected: ${evidence}
Completion estimate: ${diagnostic.completion.score}% toward the research identity checkpoint
Why useful: This page may connect genealogy, baptism or church records, religious memory, cultural identity, belief change, or human-centered religious interpretation.

Saved log loaded for this site:
${matches}

Page excerpt:
${safeText(diagnostic.excerpt).slice(0, 1400)}

Goal criteria:
${goalCriteria().map((x, i) => `${i + 1}. ${x}`).join("\n")}

Please answer in plain language. Tell me what this page proves, what it does not prove, and what I should do next.`;
  }

  async function diagnostic() {
    await loadBundledResearchLog();
    await loadSettingsAndRecords();
    const url = location.href;
    const title = document.title || "";
    const text = pageText();
    const hay = (url + " " + title + " " + text).toLowerCase();
    const matches = recordsMatchingCurrentPage(8).map(r => ({
      record_id: r.record_id || r.id || "",
      source_title: safeText(r.source_title || r.title || ""),
      source_url: r.source_url || r.url || "",
      source_domain: r.source_domain || r.domain || "",
      evidence_flags: Array.isArray(r.evidence_flags) ? r.evidence_flags : [],
      next_step_at_capture: safeText(r.next_step_at_capture || r.next_step || ""),
      excerpt: safeText(r.excerpt || "").slice(0, 900)
    }));
    const evidence = evidenceFor(hay, url);
    const completion = completionScore(evidence, matches);
    const d = {
      canReadPage: true,
      error: "",
      url,
      title: safeText(title),
      readyState: document.readyState,
      localTime: new Date().toLocaleString(),
      matchedKeywords: matchedKeywords(hay),
      evidence,
      completion,
      nextStep: nextStepFor(completion.score, evidence, matches),
      links: links(),
      excerpt: safeText(text.slice(0, 2200)),
      savedLog: {
        loaded: !!bundledResearchLog,
        loadError: bundledResearchLoadError,
        exportedAtLocal: bundledResearchLog && bundledResearchLog.exported_at_local ? bundledResearchLog.exported_at_local : "",
        bundledRecordCount: bundledResearchRecords.length,
        customRecordCount: customRecords.length,
        matches
      }
    };
    d.shareText = makeShareText(d);
    if (currentSettings.autoSaveStatus) {
      await setStorage({ rmgLastDiagnostic: d });
    }
    return d;
  }

  function pageRecordFromDiagnostic(d, sourceType) {
    const now = new Date();
    return {
      schema: "membership13.researchlog.v1",
      record_id: `rmg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      captured_at_iso: now.toISOString(),
      captured_at_local: now.toLocaleString(),
      updated_at_iso: now.toISOString(),
      updated_at_local: now.toLocaleString(),
      source_title: d.title,
      source_url: d.url,
      source_domain: location.hostname,
      source_type: sourceType || "user_added_site",
      evidence_flags: d.evidence,
      matched_keywords: d.matchedKeywords,
      next_step_at_capture: d.nextStep,
      excerpt: d.excerpt,
      compatible_with: ["membership13.researchlog.v1", "future_extension_import"],
      sync_status: "local_only"
    };
  }

  async function saveCurrentPageToJson(sourceType) {
    const d = await diagnostic();
    const rec = pageRecordFromDiagnostic(d, sourceType || "user_saved_site");
    const existingIndex = customRecords.findIndex(r => normalizeUrlForMatch(r.source_url || r.url || "") === normalizeUrlForMatch(rec.source_url));
    if (existingIndex >= 0) {
      rec.record_id = customRecords[existingIndex].record_id || rec.record_id;
      rec.captured_at_iso = customRecords[existingIndex].captured_at_iso || rec.captured_at_iso;
      rec.captured_at_local = customRecords[existingIndex].captured_at_local || rec.captured_at_local;
      customRecords[existingIndex] = Object.assign({}, customRecords[existingIndex], rec);
    } else {
      customRecords.unshift(rec);
    }
    await setStorage({
      rmgCustomRecords: customRecords,
      rmgLastJsonAutoSaveAt: new Date().toISOString()
    });
    return rec;
  }

  async function addCurrentSiteToJson() {
    return saveCurrentPageToJson("user_added_site");
  }

  async function autoSaveCurrentPageIfDue() {
    await loadSettingsAndRecords();
    if (!currentSettings.enabled || currentSettings.autoSaveJson === false) return;
    const minutes = Math.max(1, Number(currentSettings.autoSaveJsonMinutes) || 20);
    const data = await getStorage(["rmgLastJsonAutoSaveAt"]);
    const last = data.rmgLastJsonAutoSaveAt ? Date.parse(data.rmgLastJsonAutoSaveAt) : 0;
    if (last && Date.now() - last < minutes * 60000) return;
    const d = await diagnostic();
    if (!d.canReadPage) return;
    if (!d.evidence.length && !(d.savedLog && d.savedLog.matches && d.savedLog.matches.length)) return;
    await saveCurrentPageToJson("auto_saved_current_page");
  }

  function smartSummary(d) {
    const matchText = d.savedLog.matches.length ? "A saved JSON log matches this site." : "No saved JSON match yet.";
    return `${matchText} Completion estimate: ${d.completion.score}%. ${d.nextStep}`.slice(0, 130);
  }

  function buildOverlay(d, force = false) {
    lastOverlayDiagnostic = d || lastOverlayDiagnostic;
    if (!force && helperHiddenByUser) return;

    let box = document.getElementById("rmg-overlay");
    if (box) {
      const body = box.querySelector(".rmg-body");
      if (body && d && !body.dataset.userMessage) body.textContent = smartSummary(d);
      return;
    }

    box = document.createElement("div");
    box.id = "rmg-overlay";
    box.innerHTML = `
      <div class="rmg-title">Research Memory Guide <span class="rmg-pin">pinned</span></div>
      <div class="rmg-body">${smartSummary(d)}</div>
      <button id="rmg-copy">Copy text to share</button>
      <button id="rmg-save">Save this page to JSON</button>
      <button id="rmg-add">Add this site to JSON</button>
      <button id="rmg-close">Hide helper</button>
    `;

    if (!document.getElementById("rmg-overlay-style")) {
      const style = document.createElement("style");
      style.id = "rmg-overlay-style";
      style.textContent = `
        #rmg-overlay{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;background:#fff;border:1px solid #777;box-shadow:0 2px 14px rgba(0,0,0,.25);font:14px Arial,sans-serif;color:#111;border-radius:10px;padding:10px;line-height:1.35}
        #rmg-overlay .rmg-title{font-weight:bold;margin-bottom:6px}
        #rmg-overlay .rmg-pin{float:right;font-size:11px;font-weight:normal;color:#444}
        #rmg-overlay .rmg-body{margin-bottom:8px}
        #rmg-overlay button{display:block;width:100%;margin:5px 0;padding:7px;border:1px solid #777;background:#f5f5f5;border-radius:6px;cursor:pointer;color:#111}
      `;
      document.documentElement.appendChild(style);
    }

    document.documentElement.appendChild(box);
    const setBodyMessage = (message) => {
      const body = box.querySelector(".rmg-body");
      body.dataset.userMessage = "1";
      body.textContent = message;
      setTimeout(() => { if (body) delete body.dataset.userMessage; }, 8000);
    };
    box.querySelector("#rmg-copy").onclick = async () => {
      const fresh = await diagnostic();
      await navigator.clipboard.writeText(fresh.shareText);
      setBodyMessage("Copy text to share saved to clipboard.");
    };
    box.querySelector("#rmg-save").onclick = async () => {
      await saveCurrentPageToJson("user_saved_from_helper");
      setBodyMessage("Saved. This page is now in your local JSON records.");
    };
    box.querySelector("#rmg-add").onclick = async () => {
      await addCurrentSiteToJson();
      setBodyMessage("This site was added to your local JSON records and autosaved locally.");
    };
    box.querySelector("#rmg-close").onclick = async () => {
      helperHiddenByUser = true;
      await setStorage({ rmgHelperHiddenByUser: true });
      box.remove();
    };
  }

  async function maybeShowOverlay(force = false) {
    const d = await diagnostic();
    if (!currentSettings.enabled || !currentSettings.showSmartPopup) return;
    if (force) {
      helperHiddenByUser = false;
      await setStorage({ rmgHelperHiddenByUser: false });
    }
    if (force || !helperHiddenByUser) buildOverlay(d, force);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (msg && msg.type === "GET_DIAGNOSTIC") sendResponse(await diagnostic());
      if (msg && msg.type === "ADD_CURRENT_SITE") sendResponse(await addCurrentSiteToJson());
      if (msg && msg.type === "SAVE_CURRENT_PAGE") sendResponse(await saveCurrentPageToJson("user_saved_from_popup"));
      if (msg && msg.type === "SHOW_SMART_OVERLAY") { await maybeShowOverlay(true); sendResponse({ ok: true }); }
      if (msg && msg.type === "HIDE_SMART_OVERLAY") { helperHiddenByUser = true; await setStorage({ rmgHelperHiddenByUser: true }); const box = document.getElementById("rmg-overlay"); if (box) box.remove(); sendResponse({ ok: true }); }
    })();
    return true;
  });

  setTimeout(() => maybeShowOverlay(false), 900);
  setInterval(() => maybeShowOverlay(false), 3000);
  setTimeout(autoSaveCurrentPageIfDue, 2500);
  setInterval(autoSaveCurrentPageIfDue, 60000);
})();
