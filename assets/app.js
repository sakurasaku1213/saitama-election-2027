"use strict";
(() => {
  const D = window.GIKAI;
  const get = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const link = (url, label) =>
    /^https?:\/\//.test(url || "")
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="external-icon" aria-hidden="true"></span><span class="visually-hidden">（新しいタブで開く）</span></a>`
      : "";
  const count = (n) => n.toLocaleString("ja-JP");
  const norm = (text) =>
    String(text || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96))
      .replace(/髙/g, "高")
      .replace(/[﨑]/g, "崎");
  const collator = new Intl.Collator("ja", { numeric: true });
  const sorted = (xs) =>
    [...new Set(xs.filter(Boolean))].sort(collator.compare);
  const date = (value) => {
    if (!value) return "";
    const [y, m, d] = value.split("-");
    return `${y}年${Number(m)}月${d ? Number(d) + "日" : ""}`;
  };
  const tag = (text) => `<span class="type">${esc(text)}</span>`;
  const dateTag = (s) =>
    s ? `<time datetime="${esc(s)}">${esc(date(s))}</time>` : "";
  const routeLink = (page, params = {}) =>
    "#" +
    page +
    (Object.values(params).some(Boolean)
      ? "?" +
        new URLSearchParams(
          Object.entries(params).filter(([, v]) => v),
        ).toString()
      : "");
  const jump = (page, params, label) =>
    `<a href="${esc(routeLink(page, params))}">${esc(label)}</a>`;
  const noResult = (
    text = "表記を変えるか、絞り込みを解除して検索できます。",
  ) =>
    `<div class="empty"><strong>この条件に一致する資料はありません。</strong><p>${esc(text)}</p></div>`;
  const section = (heading, text, action = "") => {
    get("intro").innerHTML =
      `<div class="intro"><div><h1>${esc(heading)}</h1><p>${esc(text)}</p></div>${action ? '<div class="intro-link">' + action + "</div>" : ""}</div>`;
  };
  const allPlaces = D.areas.map((a) => a.name);
  const records = [];
  for (const batch of D.activity) {
    for (const [name, day, kind, title, url, group, evidence] of batch.rows) {
      records.push({
        place: batch.place,
        sourceTitle: batch.sourceTitle,
        name,
        date: day,
        kind,
        title,
        url,
        group,
        evidence,
      });
    }
  }
  const people = D.members;
  const personKey = (place, name) => place + "|" + norm(name);
  const personMap = new Map(
    people.map((person) => [personKey(person.place, person.name), person]),
  );
  const grouped = new Map(),
    byPerson = new Map();
  for (const record of records) {
    const key = [
      personKey(record.place, record.name),
      record.date,
      record.kind,
      record.sourceTitle,
    ].join("|");
    let group = grouped.get(key);
    if (!group) {
      group = { ...record, items: [] };
      grouped.set(key, group);
      const person = personKey(group.place, group.name);
      if (!byPerson.has(person)) byPerson.set(person, []);
      byPerson.get(person).push(group);
    }
    group.items.push(record);
  }
  const recent = (a, b) =>
    b.date.localeCompare(a.date) ||
    collator.compare(a.place, b.place) ||
    collator.compare(a.name, b.name);
  const groups = [...grouped.values()].sort(recent);
  for (const list of byPerson.values()) list.sort(recent);
  const recordPlaces = sorted(records.map((r) => r.place));
  const personPlaces = sorted(people.map((p) => p.place));
  const placeList = (p) =>
    ["埼玉県", ...p.filter((x) => x !== "埼玉県")].map((x) => [
      x,
      x === "埼玉県" ? "埼玉県議会" : x + "議会",
    ]);
  const electPhases = {
    early: "4月11日・前半",
    late: "4月25日・後半",
    other: "通常改選は統一選の対象外",
  };
  const recordPlace = (xs) =>
    xs[0] === "埼玉県" ? xs : ["埼玉県", ...xs.filter((x) => x !== "埼玉県")];
  const termURL = "https://www.pref.saitama.lg.jp/e1701/ninki.html";
  const lawURL = "https://laws.e-gov.go.jp/law/508AC0000000083";
  const voteGuide = "https://www.pref.saitama.lg.jp/e1701/info-tohyo.html";
  const phases = Object.entries(electPhases);
  const aliases = {
    pref: "people",
    incumbents: "people",
    muni: "areas",
    "all-cities": "areas",
    "city-details": "areas",
    schedule: "areas",
    guide: "areas",
    faq: "method",
    parties: "votes",
  };
  const pages = [
    "records",
    "texts",
    "cases",
    "people",
    "votes",
    "areas",
    "election",
    "method",
  ];
  let page = "records",
    state = {},
    limit = 15;
  const todayParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const calendarDay = (type) => todayParts.find((p) => p.type === type).value;
  const today = Date.UTC(
    +calendarDay("year"),
    +calendarDay("month") - 1,
    +calendarDay("day"),
  );
  document.querySelectorAll("[data-until]").forEach((el) => {
    const days =
      (Date.parse(el.dataset.until + "T00:00:00Z") - today) / 86400000;
    el.textContent =
      days === 0 ? "・投票日" : days > 0 ? "・あと" + days + "日" : "";
  });
  function setState(k, v) {
    if (v) state[k] = v;
    else delete state[k];
    limit = 15;
    history.replaceState(null, "", routeLink(page, state));
  }
  function terms() {
    return (state.q || "")
      .trim()
      .split(/[\s　]+/)
      .map(norm)
      .filter(Boolean);
  }
  const includes = (fields, query = terms()) => {
    const joined = norm(fields.filter(Boolean).join(" "));
    return query.every((t) => joined.includes(t));
  };
  const matches = (k, v) => !state[k] || state[k] === v;
  const matchYear = (s) => !state.year || s?.slice(0, 4) === state.year;
  const filteredBody = (label) => matches("place", label);
  function field(k, label, items, all = "すべて") {
    const options = items.map((x) => (Array.isArray(x) ? x : [x, x]));
    return `<label>${esc(label)}<select data-filter="${k}"><option value="">${esc(all)}</option>${options.map(([v, t]) => `<option value="${esc(v)}"${state[k] === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  }
  const searchField = (hint) =>
    `<label for="query">キーワード</label><div class="search-row"><input id="query" type="search" name="q" data-filter="q" value="${esc(state.q || "")}" aria-describedby="query-hint"><button type="submit" class="primary"><span class="glass" aria-hidden="true"></span>検索</button></div><p class="hint" id="query-hint">${esc(hint)}</p>`;
  const smallScreen = window.matchMedia("(max-width: 48rem)");
  let filtersExpanded = null;
  function filters([search, ...fields], topics = []) {
    const open =
      filtersExpanded ??
      (!smallScreen.matches ||
        Object.entries(state).some(
          ([k, v]) => !["q", "a", "b", "name"].includes(k) && v,
        ));
    get("controls").innerHTML =
      `<form class="filters" role="search" aria-label="表示中の資料を検索"><div class="keyword">${search}</div>
      ${topics.length ? `<div class="topics" role="group" aria-label="テーマで検索"><span>テーマ</span>${topics.map((t) => `<button class="topic-button" type="button" data-topic="${esc(t)}" aria-pressed="${state.q === t}">${esc(t)}</button>`).join("")}</div>` : ""}
      <details class="refine" ${open ? "open" : ""}><summary>条件で絞り込む<span class="filter-count"></span></summary><div class="refine-grid">${fields.join("")}</div></details>
      <div class="filter-state" id="filter-state" hidden><span></span><button type="button" class="clear" data-reset>条件をすべて解除</button></div></form>`;
    updateFilterState();
  }
  function updateFilterState() {
    const panel = get("filter-state");
    if (!panel) return;
    const selected = [
      ...get("controls").querySelectorAll("select[data-filter]"),
    ].filter((field) => field.value);
    const conditions = selected.map(
      (field) => field.selectedOptions[0].textContent,
    );
    if (state.q) conditions.unshift("「" + state.q + "」");
    if (state.name) conditions.unshift(state.name);
    panel.hidden = !conditions.length && !state.a && !state.b;
    panel.querySelector("span").textContent = conditions.length
      ? "適用中　" + conditions.join("・")
      : "議員を比較中";
    get("controls").querySelector(".filter-count").textContent = selected.length
      ? "（" + selected.length + "件適用中）"
      : "";
  }
  function results(html, status = "") {
    get("results").innerHTML = html;
    get("feedback").textContent = status;
    get("results-heading").hidden = page === "method";
  }
  function partial(list, draw, cls = "list", n = limit) {
    const items = list.slice(0, n);
    return (
      `<div class="${cls}">${items.map(draw).join("")}</div>` +
      (list.length > n
        ? `<button type="button" class="more" data-more>次の${Math.min(15, list.length - n)}件を表示</button>`
        : "")
    );
  }
  function groupCard(group) {
    const member = personMap.get(personKey(group.place, group.name));
    const items = group.visible || group.items;
    return `<details class="entry"><summary><div><div class="meta">${dateTag(group.date)}<span>${esc(group.place)}議会</span>${tag(group.kind)}</div><div class="title">${esc(group.name)} <small class="small">掲載${count(items.length)}項目</small></div><div class="snippet">${esc(items[0].title)}${items.length > 1 ? "　ほか" : ""}</div></div></summary><div class="detail-body">
      ${group.group ? `<p class="group-note">資料に記載された当時の会派　${esc(group.group)}</p>` : ""}
      <ul class="documents">${items.map((it) => `<li>${link(it.url, it.title)}${it.evidence?.subject ? `<p class="small">${esc(it.evidence.subject)} ・ ${esc(it.evidence.summaryType)}</p>` : ""}${it.evidence?.originalUrl ? `<div class="small">${link(it.evidence.originalUrl, "町議会の元資料（保存版も併載）")}</div>` : ""}${it.evidence?.recordingURL ? `<div class="small">${link(it.evidence.recordingURL, "同日の議員別録画")}</div>` : ""}${it.evidence?.noticeURL ? `<div class="small">${link(it.evidence.noticeURL, "質問通告の原文")}</div>` : ""}${it.evidence?.joint ? `<p class="small">提出者　${it.evidence.joint.map(esc).join("、")}</p><p class="small">審議結果　${link(it.evidence.resultURL, it.evidence.result)}</p>` : ""}</li>`).join("")}</ul>
      <p class="small">${esc(group.sourceTitle)}</p><div class="links">${jump("records", { place: group.place, name: group.name }, "この人の他の記録")}${member ? jump("people", { place: group.place, q: member.name }, "現職名簿を見る") : ""}</div></div></details>`;
  }

  const seasons2026 = [
    ["spring", "春"],
    ["summer", "初夏"],
    ["fall", "秋"],
  ];
  const coverageLabels = {
    verified: "収録済み",
    partial: "一部収録",
    identified: "資料の掲載先を確認",
    unavailable: "取得・照合できず",
    notFound: "公表を確認できず",
    noSession: "対象会期なし",
    pending: "調査中",
  };
  const coverageKinds = {
    meeting: "会期",
    activity: "質問の項目",
    text: "質問と答弁の本文",
    decisions: "議案・議決",
    votes: "個別の表決",
    policy: "政策の経過",
  };
  const textCoverageBySlot = new Map((D.questionText?.coverage || []).map(
    (row) => [row.place + "|" + row.season, row.material],
  ));
  const coverageByCouncil = new Map();
  for (const slot of D.coverage2026.sessions) {
    if (!coverageByCouncil.has(slot.place)) coverageByCouncil.set(slot.place, []);
    coverageByCouncil.get(slot.place).push(slot);
  }
  function eventSeason(day) {
    if (!day?.startsWith("2026-")) return "";
    const month = Number(day.slice(5, 7));
    if (month < 1 || month > 10) return "";
    if (month <= 4) return "spring";
    return month <= 7 ? "summer" : "fall";
  }
  function recordInSeason(record, value) {
    if (!value) return true;
    if (eventSeason(record.date) !== value) return false;
    const slot = coverageByCouncil.get(record.place)?.find((x) => x.season === value);
    if (!slot?.planned && slot?.fromDate && record.date.length === 10 && record.date < slot.fromDate) return false;
    if (!slot?.planned && slot?.toDate && record.date.length === 10 && record.date > slot.toDate) return false;
    return !record.sourceTitle.includes("臨時会");
  }
  function coverageMaterials(slot) {
    return `<dl class="coverage-materials">${Object.entries(coverageKinds).map(([key, label]) => {
      const textCoverage = key === "text" ? textCoverageBySlot.get(slot.place + "|" + slot.season) : null;
      const material = textCoverage || slot.materials[key];
      return `<div><dt>${esc(label)}</dt><dd>${esc(coverageLabels[material.state])}
      ${material.note ? `<span class="small">${esc(material.note)}</span>` : ""}
      ${material.indexURL ? `<span class="small">${link(material.indexURL, "確認した公式一覧")}</span>` : ""}</dd></div>`;
    }).join("")}</dl>`;
  }
  function coveragePanel(place, filter = "") {
    const slots = coverageByCouncil.get(place)?.filter((s) => !filter || s.season === filter) || [];
    if (!slots.length) return "";
    return `<details class="coverage cycle-coverage"><summary>2026年の資料の収録状況</summary>
      <p class="small">確認日 ${dateTag(D.coverage2026.checked)}</p>
      ${slots.map((slot) => `<details class="coverage"><summary>${esc(seasons2026.find(([key]) => key === slot.season)[1])}　${esc(slot.label)}</summary>
        ${slot.fromDate ? `<p class="small">${dateTag(slot.fromDate)}${slot.toDate ? ` ～ ${dateTag(slot.toDate)}` : ""}${slot.planned ? "（公表された予定）" : ""}</p>` : ""}
        ${coverageMaterials(slot)}
        <div class="links">${slot.sources.map((s) => link(s.url, s.label)).join("")}</div>
        <div class="links">${jump("records", { place, season: slot.season }, "この時期の掲載活動")}
        ${jump("texts", { place, season: slot.season }, "質問・答弁の本文")}
        ${jump("votes", { place, season: slot.season }, "議案と賛否")}
        ${jump("people", { place, season: slot.season }, "政策実現力をみる")} ${jump("cases", { place }, "取り組みの経過")}</div></details>`).join("")}
      </details>`;
  }
  function coverageCurrent(place) {
    const current = D.coverage2026.current.find((area) => area.place === place);
    if (!current) return "";
    return `<p class="small">名簿 ${esc(current.roster.note)}　選挙・予定候補 ${esc(current.election.note)}</p>`;
  }

  function recordControls() {
    section(
      "活動を探す",
      "議員名や地域の課題から、質問項目とその原文を探せます。",
      jump("cases", {}, "提案後の経過を読む"),
    );
    filters(
      [
        searchField("例　通学路、予算、議員名"),
        field("season", "2026年の時期", seasons2026, "全期間"),
        field("place", "議会", placeList(recordPlaces)),
        field("kind", "資料の種類", sorted(records.map((r) => r.kind))),
        field(
          "year",
          "記録年",
          sorted(records.map((r) => r.date.slice(0, 4))).reverse(),
        ),
      ],
      ["通学路", "不登校", "防災", "介護", "下水道"],
    );
  }
  function recordResults() {
    const query = terms(),
      list = [];
    for (const g of groups) {
      if (
        !filteredBody(g.place) ||
        !matches("kind", g.kind) ||
        !matchYear(g.date) ||
        !recordInSeason(g, state.season) ||
        (state.name && norm(state.name) !== norm(g.name))
      )
        continue;
      const common = [
        g.place,
        g.name,
        g.group,
        g.kind,
        g.sourceTitle,
        personMap.get(personKey(g.place, g.name))?.district,
      ];
      const visible = query.length
        ? g.items.filter((r) => includes([...common, r.title], query))
        : g.items;
      if (visible.length) list.push({ ...g, visible });
    }
    const n = list.reduce((a, g) => a + g.visible.length, 0);
    const personFilter = state.name
      ? `<p class="note">氏名で絞り込み中　<strong>${esc(state.name)}</strong>　${jump("records", { ...state, name: "" }, "氏名の指定を解除")}</p>`
      : "";
    results(
      personFilter +
        (list.length
          ? partial(list, groupCard)
          : noResult("キーワードを短くするか、条件を解除して検索できます。") +
            jump("areas", {}, "市町村の会議録を探す")),
      `該当する記録 ${count(list.length)}件（掲載項目 ${count(n)}件）`,
    );
  }
  const casePlaces = (policy) => [policy.place, ...(policy.relatedPlaces || [])];
  const caseStepPlace = (policy, step) => step.place || policy.place;
  function caseControls() {
    section(
      "取り組みの経過",
      "質問・検討・議決・実施を時系列で読み、各段階を担った人と機関を確認できます。",
    );
    filters([
      searchField("例　手話、議員名、条例"),
      field("place", "議会", placeList(sorted(D.cases.flatMap(casePlaces)))),
    ]);
  }
  function caseCard(c) {
    const last = c.steps[c.steps.length - 1];
    const steps = c.steps.map((step) => {
      const place = caseStepPlace(c, step);
      const locality = step.place ? ` ${tag(place + "議会")}` : "";
      const vote = step.billNumber
        ? jump("votes", { place, season: eventSeason(step.date), q: step.billNumber }, "この議案の議決・表決")
        : "";
      const text = step.archiveId && step.blocks?.length
        ? archivedMinutes(place, step.date, step.archiveId, step.blocks)
        : "";
      const actions = step.memberActions?.length
        ? `<details class="case-actions"><summary>議員本人の関与 ${count(step.memberActions.length)}件</summary>
          <dl>${step.memberActions.map((action) => `<dt>${esc(action.name)}</dt>
            <dd>${esc(action.detail)}${action.blocks?.length
              ? archivedMinutes(place, step.date, step.archiveId, action.blocks)
              : ""}</dd>`).join("")}</dl></details>`
        : "";
      return `<li>${dateTag(step.date)}　${tag(step.stage)}${locality}<strong>${esc(step.actor)}</strong>
        <p>${esc(step.detail)}</p><div class="docs-link">${link(step.url, step.sourceTitle)} ${vote}${text}</div>${actions}</li>`;
    }).join("");
    const councilLabel = c.relatedPlaces?.length ? casePlaces(c).join("・") : c.place + "議会";
    return `<details class="case"><summary><div><div class="meta">${tag(c.topic)}<span>${esc(councilLabel)}</span><span>${c.steps.length}段階</span></div><h3>${esc(c.title)}</h3><p class="small">${esc(date(c.steps[0].date))} ～ ${esc(date(last.date))}　${esc(last.stage)}</p></div></summary><div class="detail-body"><p><b>資料に登場する人・組織</b>　${c.actors.map(esc).join("、")}</p><ol class="steps">${steps}</ol>${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}</div></details>`;
  }
  function caseResults() {
    const list = D.cases.filter(
      (c) =>
        casePlaces(c).some(filteredBody) &&
        includes([
          ...casePlaces(c),
          c.title,
          c.topic,
          ...c.actors,
          ...c.steps.flatMap((s) => [s.stage, s.actor, s.detail, ...(s.memberActions || []).map((a) => a.detail)]),
        ]),
    );
    results(
      list.length
        ? partial(list, (c) =>
            list.length === 1
              ? caseCard(c).replace(
                  '<details class="case">',
                  '<details class="case" open>',
                )
              : caseCard(c),
          )
        : noResult(),
      `出典付きの事例 ${list.length}件`,
    );
  }
  function personControls() {
    section(
      "議員名簿",
      "県と全63市町村の議会名簿を掲載。氏名・選挙区・会派・委員会から探し、期間中に掲載された本人の活動を読めます。",
      jump("areas", {}, "全市町村の公式名簿"),
    );
    const groupsHere = people
      .filter((p) => filteredBody(p.place))
      .map((p) => p.group);
    filters([
      field("season", "政策比較の対象", seasons2026,
        councilPolicyReviews.has(state.place) ? "春・初夏・秋の３会期" :
          state.place ? "春（既定）" : "各議会の既定"),
      searchField("例　熊谷市、予算特別委員、氏名"),
      field("place", "議会", placeList(personPlaces)),
      field("group", "名簿上の会派", sorted(groupsHere)),
      field(
        "year",
        "活動の対象年",
        sorted(records.map((r) => r.date.slice(0, 4))).reverse(),
      ),
    ]);
  }

  const review = D.policyReview;
  const reviewQuestions = new Map(
    records
      .filter((r) => r.place === review.place && r.sourceTitle === review.questionSource)
      .map((r) => [r.url, r]),
  );
  const reviewsByPerson = new Map();
  for (const issue of review.issues) {
    const key = personKey(review.place, issue.name);
    if (!reviewsByPerson.has(key)) reviewsByPerson.set(key, []);
    reviewsByPerson.get(key).push(issue);
  }
  const questionLevels = {
    specific: "具体的な提案・検証",
    general: "要望・見解の確認",
    unknown: "本文未確認",
  };
  const questionIntents = {
    proposal: "具体策の提案",
    verification: "施策・答弁の検証",
    facts: "現状・根拠の確認",
    general: "見解・一般要望",
  };
  const followUpLabels = {
    confirmed: "後続行動を確認",
    searched: "確認した資料に後続行動の記録なし",
    incomplete: "追跡資料が不足",
    open: "追跡期間中",
  };
  function archivedMinutes(place, day, archiveId, blocks) {
    if (!place || !get("question-text-bodies")) return "";
    const archive = D.questionText.documents.find((doc) =>
      archiveId ? doc.id === archiveId : doc.place === place && doc.date === day && doc.scope !== "notice");
    const label = archive?.scope === "summary" ? "収録した紙面要旨" :
      archive?.scope === "recording" && archive.kind === "公式録画の公開自動字幕" ? "収録した公開自動字幕" : "収録本文";
    return archive ? "　" + jump("texts", {
      place, season: archive.season, ...(archiveId ? { doc: archive.id, blocks: blocks?.join(",") } : { q: day }),
    }, label) : "";
  }
  function reviewEvent(event, place) {
    return `<li>${dateTag(event.date)} ${tag(event.stage)}${event.repeatedRequest ? ` ${tag("同じ要望の再提示")}` : ""}
      <strong>${esc(event.actor)}</strong><p>${esc(event.detail)}</p>
      <p class="small">${link(event.url, event.sourceTitle)}${event.locator ? `　${esc(event.locator)}` : ""}${archivedMinutes(place, event.date, event.archiveId, event.blocks)}</p></li>`;
  }
  function policyIssue(issue, place) {
    const original = reviewQuestions.get(issue.items[0].url) || issue.items[0];
    const title = issue.title || original.title.split("／").at(-1);
    const questions = issue.items.map((item) => {
      const q = reviewQuestions.get(item.url) || item;
      const intent = questionIntents[item.intent] || questionLevels[item.level];
      return `<li>${tag(q.kind)} <strong>${esc(intent)}</strong>
        <p>${esc(item.reason)}</p>${item.intentReason ? `<p class="small">分類の根拠　${esc(item.intentReason)}</p>` : ""}
        <p class="small">${link(q.url, q.title)}　${dateTag(q.date)}${item.locator ? `　${esc(item.locator)}` : ""}${archivedMinutes(place, q.date)}</p>${item.recordingURL ? `<p class="small">${link(item.recordingURL, "当日の公式録画")}</p>` : ""}</li>`;
    }).join("");
    const followUp = followUpLabels[issue.followUp];
    const progress = issue.caseTitle && D.cases.find((entry) =>
      casePlaces(entry).includes(place) && entry.title === issue.caseTitle,
    );
    return `<details class="entry policy-issue"><summary><span>${esc(title)}</span></summary>
      <div class="detail-body"><h5>何を尋ねたか</h5><ul class="policy-evidence">${questions}</ul>
      <h5>本人の後続行動</h5><p>${esc(followUp)}${issue.followUpNote ? `。 ${esc(issue.followUpNote)}` : ""}</p>
      ${issue.actions?.length ? `<ol class="steps">${issue.actions.map((event) => reviewEvent(event, place)).join("")}</ol>` : ""}
      <h5>行政の対応・到達点</h5>
      ${issue.outcomes?.length ? `<ol class="steps">${issue.outcomes.map((event) => reviewEvent(event, place)).join("")}</ol>` : `<p>${link(original.url, "当初の答弁を読む")}</p>`}
      ${progress ? `<p class="small">${tag(progress.steps.at(-1).stage)} ${jump("cases", { place, q: progress.title }, "資料で追った経過を読む")}</p>` : ""}
      </div></details>`;
  }

  const councilPolicyReviews = new Map(D.councilPolicyReviews.map((entry) => [entry.place, entry]));
  const wholePolicyPeriod = "all-2026";
  function comprehensivePolicyCard(p, comparison, period) {
    const full = period === wholePolicyPeriod;
    const inPeriod = (item) => full || item.season === period;
    const samePerson = (person) => norm(person.name) === norm(p.name);
    const appearances = comparison.appearances.filter((item) => inPeriod(item) && samePerson(item));
    const issues = comparison.issues.filter((issue) =>
      samePerson(issue) && issue.items.some(inPeriod),
    );
    const periodLabel = full ? "春・初夏・秋の３会期" : seasons2026.find(([key]) => key === period)?.[1];
    const heading = `<h4>政策実現力をみる</h4><p class="small">2026年${esc(periodLabel)}の一般質問。議会での後続行動は${dateTag(comparison.followThrough || comparison.through)}までの資料から収録。</p>`;
    if (!appearances.length) {
      return `<section class="policy-review">${heading}<p>この範囲の公式一般質問者一覧に、本人の掲載回はありません。</p>
        <p class="small">${link(comparison.indexURL, "公式一般質問者一覧")}</p></section>`;
    }
    const intentKinds = Object.keys(questionIntents);
    const primaryIntents = issues.map((issue) => intentKinds.find((key) =>
      issue.items.some((item) => inPeriod(item) && item.intent === key)));
    const metrics = [
      ["一般質問の掲載回", appearances.length],
      ["収録した論点", issues.length],
      ["後続行動を確認", issues.filter((issue) => issue.followUp === "confirmed").length],
    ];
    const intentSummary = comparison.classifiedQuestions
      ? `<dl class="policy-metrics policy-intents">${intentKinds.map((key) =>
        `<div><dt>${esc(questionIntents[key])}</dt><dd>${count(primaryIntents.filter((intent) => intent === key).length)}件</dd></div>`,
      ).join("")}</dl>`
      : "";
    const coverageNote = `<p class="small">${esc(comparison.note)} ${full ? "" : "当該会期の論点に関する別会期の答弁と後続行動も表示します。"} ${link(comparison.indexURL, "公式一般質問者一覧")}</p>`;
    return `<section class="policy-review">${heading}
      <dl class="policy-metrics policy-overview">${metrics.map(([label, total]) => `<div><dt>${esc(label)}</dt><dd>${count(total)}件</dd></div>`).join("")}</dl>
      ${intentSummary}
      ${coverageNote}
      <details class="policy-issues"><summary>論点ごとの判定と出典を読む</summary>
        <div class="list">${issues.map((issue) => policyIssue(issue, comparison.place)).join("")}</div>
      </details>
    </section>`;
  }

  function policyReviewCard(p) {
    const comparison = councilPolicyReviews.get(p.place);
    if (comparison) return comprehensivePolicyCard(p, comparison, state.season || wholePolicyPeriod);
    const season = state.season || "spring";
    if (p.place !== review.place || season !== "spring") {
      const cohort = D.coverage2026.policy.find((entry) => entry.place === p.place && entry.season === season);
      const issues = cohort?.issues.filter((issue) => norm(issue.name) === norm(p.name)) || [];
      const seasonLabel = seasons2026.find(([key]) => key === season)?.[1];
      const content = issues.length
        ? `<details class="policy-issues"><summary>照合済みの論点を読む</summary><div class="list">${issues.map((issue) => policyIssue(issue)).join("")}</div></details>`
        : "<p>原資料で本人の役割を照合済みの論点は、この欄にはまだありません。</p>";
      return `<section class="policy-review"><h4>政策実現力をみる</h4><p class="small">2026年${esc(seasonLabel)}の定例会。表示は出典を照合済みの資料に限ります。</p>${content}${coveragePanel(p.place, season)}</section>`;
    }
    const issues = reviewsByPerson.get(personKey(p.place, p.name)) || [];
    const heading = `<h4>政策実現力をみる</h4><p class="small">${esc(review.label)}の質問と、${dateTag(review.through)}までの経過です。</p>`;
    if (!issues.length) return `<section class="policy-review">${heading}<p>対象会期の一般質問・代表質問に本人の登壇記録はありません。</p></section>`;
    const items = new Set();
    const withoutText = new Set();
    for (const issue of issues) {
      for (const item of issue.items) {
        items.add(item.url);
        if (item.level === "unknown") withoutText.add(item.url);
      }
    }
    const withoutCoverage = issues.filter((issue) => ["incomplete", "open"].includes(issue.followUp)).length;
    const metrics = [
      ["掲載項目", items.size],
      ["論点", issues.length],
      ["具体的な提案・検証", issues.filter((issue) => issue.items.some((item) => item.level === "specific")).length],
      ["後続行動を確認", issues.filter((issue) => issue.followUp === "confirmed").length],
    ];
    return `<section class="policy-review">${heading}
      <dl class="policy-metrics">${metrics.map(([label, total]) => `<div><dt>${esc(label)}</dt><dd>${count(total)}件</dd></div>`).join("")}</dl>
      ${withoutText.size ? `<p class="small">本文未確認 ${count(withoutText.size)}項目</p>` : ""}
      ${withoutCoverage ? `<p class="small">追跡資料不足または期間中 ${count(withoutCoverage)}論点</p>` : ""}
      <p class="small">後続行動はこの会期の論点に関する公表記録です。委員会の報告には発言者が記されない場合があります。 ${jump("method", {}, "確認した資料と基準")}</p>
      <details class="policy-issues"><summary>論点ごとの判定と出典を読む</summary>
        <div class="list">${issues.map((issue) => policyIssue(issue)).join("")}</div>
      </details></section>`;
  }
  function policyReviewMethod() {
    return `<div class="panel"><h3>政策実現力の比較で確認した資料</h3>
      <p>${esc(review.label)}の一般質問・代表質問が対象です。同じ議員による同じ対象・同じ要求を一論点にまとめます。一つの掲載項目に別の施策への質問が含まれるときは、論点を分け、掲載項目は一度数えます。施策や対象を特定し、変更案、数値・期限、資料など、何を求めたのかが明確な質問を「具体的な提案・検証」と表示します。</p>
      <p>${esc(review.coverageNote)}</p><p class="small">資料の確認日 ${dateTag(review.checked)}</p>
      ${[...councilPolicyReviews.values()].map((item) =>
        `<p><b>${esc(item.place)}議会</b>　${esc(item.note)} ${link(item.indexURL, "公式一般質問者一覧")}</p>
          ${item.classifiedQuestions ? "<p>質問は、具体策の提案、施策・答弁の検証、現状・根拠の確認、見解・一般要望に分けます。複数に当たる論点は、この順で１件に数えます。発言ごとの分類と根拠は各論点に掲載しています。</p>" : ""}`).join("")}
      <ul class="documents">${review.sources.map((source) => `<li>${link(source.url, source.label)} ${esc(source.note || "")}</li>`).join("")}</ul></div>`;
  }
  function relatedCases(p) {
    return D.cases.filter(
      (c) =>
        casePlaces(c).includes(p.place) && c.actors.some((n) => norm(n) === norm(p.name)),
    );
  }
  function memberCaseSummary(p, policyCase) {
    const actions = policyCase.steps.filter((step) => caseStepPlace(policyCase, step) === p.place)
      .flatMap((step) => (step.memberActions || []).filter((action) => norm(action.name) === norm(p.name))
        .map((action) => ({ ...step, detail: action.detail, blocks: action.blocks })));
    if (!actions.some((action) => recordInSeason({ ...action, place: p.place }, state.season || "spring"))) return "";
    const last = policyCase.steps.at(-1);
    return `<details class="entry member-case"><summary><span>${esc(policyCase.title)}</span></summary><div class="detail-body">
      <h5>本人が行ったこと</h5><ol class="steps">${actions.map((action) => `<li>${dateTag(action.date)}
        <p>${esc(action.detail)}</p><p class="small">${link(action.url, action.sourceTitle)}${action.archiveId ? archivedMinutes(p.place, action.date, action.archiveId, action.blocks) : ""}</p></li>`).join("")}</ol>
      <h5>事例の最新記録</h5><p>${dateTag(last.date)}　${esc(last.actor)}　${esc(last.stage)}</p>
      <p class="small">${link(last.url, last.sourceTitle)}</p>
      ${jump("cases", { place: p.place, q: policyCase.title }, "答弁・議決・事業の経過を読む")}
    </div></details>`;
  }
  function personCard(p, compare = false) {
    const work = (byPerson.get(personKey(p.place, p.name)) || []).filter((g) =>
      matchYear(g.date),
    );
    const years = sorted(work.map((g) => g.date.slice(0, 4)));
    const related = relatedCases(p).map((item) => ({ item, summary: memberCaseSummary(p, item) }));
    const caseSummaries = related.map(({ summary }) => summary).join("");
    const caseEvidence = caseSummaries ? `<section class="policy-review"><h4>事例で確認できる本人の関与</h4>
      <p class="small">対象会期に本人の記録がある事例です。同じ事例での別会期の記録も表示します。</p>${caseSummaries}</section>` : "";
    const policy = policyReviewCard(p);
    const types = sorted(work.map((g) => g.kind));
    const typeLinks = types.map((kind) =>
      jump(
        "records",
        { place: p.place, name: p.name, kind, year: state.year },
        kind,
      ),
    );
    return `<article class="${compare ? "compare-cell" : "person"}"><div class="meta"><span>${esc(p.place)}議会</span>${p.district ? tag(p.district) : ""}</div><h3>${esc(p.name)}</h3>
      ${compare ? policy + caseEvidence : ""}
      <p>${esc(p.group || "会派は掲載元で確認")}</p>${p.roles?.length ? `<p class="small">委員会等　${p.roles.map(esc).join(" · ")}</p>` : ""}
      ${work.length ? `<p class="group-note">記録のある年　${years.join("・")}年</p><div class="links">${typeLinks.join("")}</div><p class="snippet">直近の掲載項目　${esc(work[0].items[0].title)}</p>` : `<p class="group-note">この期間の収録資料では本人の項目を特定できていません。掲載元の記録も参照できます。</p>`}
      ${compare ? "" : policy + caseEvidence}
      ${related.filter(({ summary }) => !summary).map(({ item }) => `<div class="story-link">${jump("cases", { place: p.place, q: item.title }, item.title)}</div>`).join("")}
      <div class="links">${work.length ? jump("records", { place: p.place, name: p.name, year: state.year }, "本人の掲載記録") : ""}${link(p.url, "議会の名簿")}${link(p.groupURL, "会派名簿")}${link(p.speechUrl, "本人の発言検索")}${link(p.videoUrl, "本人の録画")}</div>
      ${p.asOf || p.profileDate ? `<p class="small">名簿・プロフィールの資料日　${esc(date(p.asOf || p.profileDate))}</p>` : `<p class="small">名簿の閲覧確認　${date(D.asOf)}</p>`}</article>`;
  }
  function compareBox() {
    const place = state.place || "埼玉県";
    const same = people.filter((p) => p.place === place);
    const choice = (key, label) =>
      `<label>${label}<select data-compare="${key}"><option value="">議員を選ぶ</option>${same.map((p) => `<option value="${esc(p.name)}"${state[key] === p.name ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`;
    const selected = [state.a, state.b]
      .filter((n, i, a) => n && a.indexOf(n) === i)
      .map((n) => same.find((p) => p.name === n))
      .filter(Boolean);
    return `<details class="compare panel"${selected.length ? " open" : ""}><summary>同じ議会の2人を並べて読む</summary><p class="small">${esc(place)}議会の同じ収録資料で比べます。議会は上の絞り込みで変更できます。</p><div class="choose-people">${choice("a", "1人目")}${choice("b", "2人目")}</div><div class="grid">${selected.map((p) => personCard(p, true)).join("")}</div></details>`;
  }
  function factionSummary() {
    if (state.place && state.place !== "埼玉県") return "";
    const roster = people.filter((p) => p.place === "埼玉県"),
      groups = new Map();
    roster.forEach((p) => groups.set(p.group, (groups.get(p.group) || 0) + 1));
    const seats = D.districts.reduce((total, d) => total + d.seats, 0);
    return `<details class="coverage"><summary>県議会の会派別人数　現員${roster.length}・定数${seats}</summary><p class="small">${date(D.rosterDate)}掲載の会派別名簿。欠員${seats - roster.length}。</p><ul class="ballots">${[...groups].map(([g, n]) => `<li>${jump("people", { place: "埼玉県", group: g }, g)}<b>${n}人</b></li>`).join("")}</ul>${link(D.rosterURL, "県議会の会派別原表")}</details>`;
  }
  function personResults() {
    const list = people.filter(
      (p) =>
        filteredBody(p.place) &&
        matches("group", p.group) &&
        includes([p.name, p.place, p.group, p.district, ...(p.roles || [])]),
    );
    results(
      factionSummary() +
        compareBox() +
        (list.length
          ? partial(list, (p) => personCard(p), "grid")
          : noResult()),
      `各議会の名簿に掲載された該当者 ${count(list.length)}人`,
    );
  }
  const voteRows = [];
  for (const session of D.voteSessions)
    for (const [
      num,
      title,
      day,
      decision,
      cols,
      values,
      pdfPage,
    ] of session.rows)
      voteRows.push({
        num,
        title,
        date: day,
        decision,
        cols: session.headers[cols],
        values,
        pdfPage,
        session,
      });
  const voteMark = (value) =>
    ({
      "○": "賛成",
      〇: "賛成",
      "×": "反対",
      除: "除斥",
      欠: "欠席",
      "": "原表空欄",
    })[value] || value;
  function voteControls() {
    section(
      "議案と賛否",
      "議会ごとに議案の結果と、公表されている個人別・会派別の表決を確認できます。",
      jump("method", {}, "原表の読み方"),
    );
    const sessions = state.place && state.place !== "埼玉県"
      ? sorted([...D.bills, ...D.coverage2026.decisions].filter((b) => b.place === state.place).map((b) => b.session)).reverse()
      : [...D.voteSessions].reverse().map((s) => [s.id, s.label]);
    filters([
      searchField("例　給食、補正予算、条例"),
      field("place", "議会", placeList(personPlaces)),
      field("season", "2026年の時期", seasons2026, "全期間"),
      field("session", "定例会", sessions),
      field("split", "賛否の異同", [["mixed", "賛成・反対の両方あり"]]),
    ]);
  }
  function localBillCard(b) {
    const v = D.localVotes.find(
      (row) => row.place === b.place && row.session === b.session && row.number === b.number,
    );
    const ballots = Object.entries(v?.votes || b.votes || {});
    const named = b.names?.length
      ? b.names.map(esc).join("、")
      : esc(b.proposer || "掲載資料で提出者を特定できず");
    const separateVote = b.voteURL && b.voteURL !== b.resultURL;
    const byGroup = b.voteType === "会派等";
    const proposalSource = b.url !== b.resultURL && b.url !== b.voteURL
      ? link(b.url, b.sourceTitle || (b.resultLocator ? "議会だよりの議決結果" : "議案・提出者の原文"))
      : "";
    const resultTitle = b.resultLocator || (separateVote ? "議決結果の原表" : "審議結果・表決の原表");
    const voteTitle = byGroup ? "会派等の表決の原表" : ballots.length ? "記名表決の原表" : "表決の注記の原表";
    const record = b.archiveId && D.questionText.documents.find((doc) => doc.id === b.archiveId);
    const sources = `${proposalSource} ${link(b.resultURL, resultTitle)}
      ${separateVote ? link(b.voteURL, voteTitle) : ""}
      ${b.committeeURL ? link(b.committeeURL, "委員会審査の公式一覧") : ""}
      ${b.voteConflictURL ? link(b.voteConflictURL, "採決を宣告した議長を確認できる会議録") : ""}
      ${record ? link(record.url, "当日の本会議録") + archivedMinutes(b.place, b.date, record.id, b.blocks) : ""}`;
    const scope = byGroup
      ? '<p class="small">表決の単位　会派等。人数の内訳は原表の注記によります。</p>'
      : "";
    const note = b.voteNote ? `<p class="small">${esc(b.voteNote)}</p>` : "";
    const followUp = b.followUp ? `<p class="small">後日の議決　${dateTag(b.followUp.date)}　${esc(b.followUp.session)}　${tag(b.followUp.result)}
      ${link(b.followUp.url, b.followUp.locator || "後日の公式議決結果")}</p>` : "";
    const citation = esc(b.number || b.resultLocator || "");
    const supporters = b.proposalSupporters?.length
      ? `<p class="small">${esc(b.proposalSupporterLabel || "議案書の賛成者")}　${b.proposalSupporters.map(esc).join("、")}</p>` : "";
    const conflicts = b.voteConflicts || [];
    return `<details class="entry"><summary><div><div class="meta">${tag(b.result)}<span>${esc(b.place)}議会</span>${dateTag(b.date)}<span>${citation}</span>${conflicts.length ? tag("表決原表に注記") : ""}</div><p class="title">${esc(b.title)}</p></div></summary><div class="detail-body"><p>${esc(b.proposalRole || "提出者")}　${named}</p>${supporters}${scope}${conflicts.length ? note : ""}<ul class="ballots">${ballots.map(([name, position]) => `<li><span>${esc(name)}</span><b>${conflicts.includes(name) ? "原表では　" : ""}${esc(position)}</b></li>`).join("")}</ul>${conflicts.length ? "" : note}${followUp}${!ballots.length && !note ? `<p class="small">個々の賛否はこの表に掲載していません。</p>` : ""}<div class="links">${sources}</div></div></details>`;
  }
  function voteResults() {
    const prefItems = voteRows.filter(
      (v) =>
        matches("session", v.session.id) &&
        (!state.season || eventSeason(v.date || ("2026-" + v.session.id.slice(3))) === state.season && v.session.id.startsWith("r08")) &&
        (!state.split ||
          (v.values.includes("×") &&
            v.values.some((x) => x === "○" || x === "〇"))) &&
        includes([v.num, v.title, v.decision, v.session.label]),
    );
    const locals = [...D.bills, ...D.coverage2026.decisions].filter(
      (b) =>
        filteredBody(b.place) &&
        matches("session", b.session) &&
        matches("season", b.season || eventSeason(b.date)) &&
        includes([b.title, b.number, b.resultLocator, b.result, b.followUp?.result, b.followUp?.locator,
          ...(b.names || []), ...(b.proposalSupporters || [])]) &&
        (!state.split ||
          (Object.values(b.votes || {}).some((vote) => vote.includes("賛成")) &&
            Object.values(b.votes || {}).some((vote) => vote.includes("反対"))) ||
          D.localVotes.some(
            (v) =>
              v.place === b.place &&
              v.session === b.session &&
              v.number === b.number &&
              Object.values(v.votes).includes("賛成") &&
              Object.values(v.votes).includes("反対"),
          )),
    );
    const list = [
      ...(!state.place || state.place === "埼玉県" ? prefItems : []),
      ...locals,
    ].sort((a, b) => {
      const key = (r) =>
        r.date ||
        (r.session?.id
          ? `20${18 + Number(r.session.id.slice(1, 3))}-${r.session.id.slice(3)}`
          : "");
      return key(b).localeCompare(key(a));
    });
    const cards = (v) =>
      !v.cols
        ? localBillCard(v)
        : `<details class="entry"><summary><div><div class="meta">${tag(v.decision)}<span>${esc(v.session.label)}</span>${v.title === v.num ? "" : "<span>" + esc(v.num) + "</span>"}</div><p class="title">${esc(v.title)}</p></div></summary><div class="detail-body"><p class="small">${v.date ? "議決日　" + esc(date(v.date)) : "議決日は原表空欄"}　｜　表決表 ${v.pdfPage}頁</p><ul class="ballots">${v.cols.map((c, i) => `<li><span>${esc(c)}</span><b class="vote-badge">${esc(voteMark(v.values[i]))}</b></li>`).join("")}</ul><div class="links">${link(v.session.source + "#page=" + v.pdfPage, "県議会の表決表（PDF）")}${link(v.session.bills, "議案一覧")}${link(v.session.statements, "主要会派による説明")}</div></div></details>`;
    const notice = `<p class="note">県の会派欄は議会運営委員会で確認した立場です。市町村は原表に従い、個人別または会派等の表決を表示します。継続審査の行はその扱いに関する表決です。空欄・欠席・除斥はそれぞれ原表の区分を保っています。</p>`;
    const requests = D.cityRequests;
    const city =
      requests && (!state.place || state.place === "さいたま市")
        ? `<details class="coverage"><summary>さいたま市の会派別予算要望と市の回答</summary><p class="small">令和8年度当初予算について、各会派の要望ごとに市の回答を確認できます。</p><div class="links">${link(requests.url, "市が公表した回答書一覧")}${requests.links.map(([t, u]) => link(u, t)).join("")}</div></details>`
        : "";
    results(
      notice + city + coveragePanel(state.place, state.season) + (list.length ? partial(list, cards) : noResult("議会を選ぶと、確認した原資料と議決・表決の収録状況を読めます。")),
      `該当する議案・表決　${count(list.length)}件`,
    );
  }
  function areaControls() {
    section(
      "市町村と選挙日程",
      "市町村議の任期満了日と統一選の日程を照合。各地の現職名簿、会議録、選管の案内を一か所で開けます。",
    );
    filters([
      searchField("市町村名・地域名"),
      field("region", "地域", sorted(D.areas.map((a) => a.region))),
      field("phase", "市町村議の通常改選", phases),
    ]);
  }
  function schedulePanel() {
    return `<details class="coverage"><summary>県議選・市町議選の告示日と投票案内</summary><div class="table-wrap"><table><thead><tr><th>議会</th><th>告示</th><th>投票</th></tr></thead><tbody>${D.schedule.map((s) => `<tr><th>${esc(s.label)}</th><td>${dateTag(s.notice)}</td><td>${dateTag(s.poll)}</td></tr>`).join("")}</tbody></table></div><p class="note">県議選は4月11日。市町村議選は議員の任期満了日を基準に分類しています。無投票、解散、補欠選挙等は個別の選管の告示で確認できます。</p><p class="small">投票所・期日前投票の場所と時間は各市町村の選管へ。転居時の選挙人名簿の扱いも、登録先の選管が案内します。</p><div class="links">${link(lawURL, "令和8年法律第83号 第1条・第2条")}${link(termURL, "県選管の任期満了日一覧")}${link(voteGuide, "県選管の投票案内")}</div></details>`;
  }
  function areaCard(a) {
    const num = D.stats.municipalities[a.name],
      joined = recordPlaces.includes(a.name);
    const district = D.districts.filter((d) => d.district.includes(a.name));
    return `<details class="area"><summary><div><div class="meta"><span>${esc(a.region)}地域</span>${tag(a.phase === "other" ? "別日程" : a.phase === "early" ? "前半" : "後半")}</div><h3>${esc(a.name)}</h3><p>${esc(electPhases[a.phase])}</p></div></summary><div class="detail-body">
      <p><b>市町村議の任期満了</b>　${dateTag(a.termEnd)}${a.termMethod === "calculated" ? "（算定）" : ""}</p>${a.termNote ? `<p class="small">${esc(a.termNote)}</p>` : ""}
      <div class="links">${link(a.sourceURL, "任期の根拠")}${link(a.announcementURL, "市選管の執行日案内")}${link(a.electionURL, a.name === "小鹿野町" ? a.electionTitle : "選挙管理委員会の案内")}${link(a.briefingURL, "立候補予定者説明会")}</div>
      ${district.length ? `<p class="group-note">県議の選挙区　${district.map((d) => link(d.url, d.district + "（定数" + d.seats + "）")).join("、")}</p>` : ""}
      <div class="links">${link(a.councilURL, a.councilLabel || "議会")}${link(a.rosterURL, a.rosterLabel || "議員名簿")}${link(a.recordsURL, a.recordsLabel || "会議録")}${link(a.bulletinURL, "議会だより")}${link(a.billsURL, a.billsLabel || "議案・審議結果")}${link(a.billsOriginalURL, "審議結果の原本（町公式PDF）")}</div>
      ${a.sourceNote ? `<p class="small">${esc(a.sourceNote)}</p>` : ""}
      ${coverageCurrent(a.name)}${coveragePanel(a.name)}
      <div class="links">${joined ? jump("records", { place: a.name }, "この議会の掲載活動") : ""}${personPlaces.includes(a.name) ? jump("people", { place: a.name }, "この議会の現職") : ""}</div>
      ${num ? `<details class="area-stat"><summary>届出時の党派別人数（2024年12月31日時点）</summary><p class="small">当時の定数${num.seats}、現員${num.seats - num.vacant}、欠員${num.vacant}。所属党派証明書に基づく県選管の過去の集計です。</p>${D.stats.groups.map((g, i) => `<div class="stat-row"><span>${esc(g)}</span><b>${num.counts[i]}人</b></div>`).join("")}${num.other ? `<p class="small">諸派の内訳　${esc(num.other)}</p>` : ""}${link(D.stats.source, "県選管の原表（PDF）")}</details>` : ""}
      </div></details>`;
  }
  function areaResults() {
    const list = D.areas.filter(
      (a) =>
        matches("region", a.region) &&
        matches("phase", a.phase) &&
        includes([a.name, a.region]),
    );
    results(
      schedulePanel() + coveragePanel("埼玉県") +
        (list.length ? partial(list, areaCard, "grid") : noResult()),
      `全63市町村のうち ${list.length}件。市町村議選の任期基準は前半1市、後半20市・12町、対象外30市町村。`,
    );
  }
  function electionControls() {
    section(
      "予定候補の発表",
      "発表元の表記で、予定候補の公認・推薦・現新元を確認できます。正式な候補者は告示日の届出後に選管が公表します。",
      jump("areas", {}, "選管の案内を探す"),
    );
    filters([
      searchField("氏名・選挙区・自治体"),
      field(
        "place",
        "立候補を予定する議会",
        placeList(sorted(D.nominations.map((n) => n.place))),
      ),
      field(
        "party",
        "公認・推薦の政党等",
        sorted(D.nominations.map((n) => n.party)),
      ),
    ]);
  }
  function electionResults() {
    const list = D.nominations.filter(
      (n) =>
        filteredBody(n.place) &&
        matches("party", n.party) &&
        includes([
          n.name,
          n.displayName,
          n.place,
          n.district,
          n.party,
          n.status,
          n.career,
        ]),
    );
    list.sort(
      (a, b) =>
        collator.compare(a.place, b.place) ||
        collator.compare(a.district, b.district) ||
        collator.compare(a.name, b.name),
    );
    const draw = (n) =>
      `<article class="person"><div class="meta">${tag(n.status)}<span>${esc(n.place)}議会　${esc(n.district)}</span></div><h3>${esc(n.name)}</h3>${n.displayName && n.displayName !== n.name ? `<p class="small">公表名　${esc(n.displayName)}</p>` : ""}<p>${esc(n.party)}${n.career ? "　" + esc(n.career) : ""}</p><div class="links">${link(n.url, "発表の原文")}${link(n.profileUrl, "発表元の一覧・プロフィール")}${link(n.partySource, "所属表記の出典")}${byPerson.has(personKey(n.place, n.name)) ? jump("records", { place: n.place, name: n.name }, "同じ氏名・議会の掲載記録") : ""}</div><p class="small">${n.date ? esc(n.dateType || "発表・一覧の基準日") + "　" + esc(date(n.date)) : "掲載確認　" + esc(date(D.asOf))}</p></article>`;
    results(
      `<p class="note">収録した発表に名前がある人を表示します。政党名は公認・推薦等の発表に基づく区分です。無所属の表示には議会名簿など別の根拠を添えます。公認・推薦は発表団体の意思表示です。無所属・新人を含め、届出前は立候補者全体の分母が確定しません。</p>` +
        (list.length ? partial(list, draw, "grid") : noResult()),
      `掲載した発表の該当者 ${list.length}件（発表元ごと）`,
    );
  }
  function sourcesPanel() {
    const official = [
      [D.rosterURL, "埼玉県議会・会派別議員名簿"],
      [D.districtURL, "埼玉県議会・選挙区別名簿"],
      [
        "https://www.pref.saitama.lg.jp/f1603/kaigiroku-kensaku.html",
        "埼玉県議会・会議録検索",
      ],
      [termURL, "県選管・任期満了日一覧"],
      [lawURL, "選挙期日の臨時特例法"],
      [
        "https://www.shugiin.go.jp/Internet/itdb_gian.nsf/html/gian/keika/1DE363A.htm",
        "衆議院・成立日と公布番号",
      ],
      [D.stats.source, "県選管・届出党派別人員の原表"],
      [
        "https://www.pref.saitama.lg.jp/documents/211727/04-01_souron.pdf",
        "県の10地域区分（5か年計画）",
      ],
      [voteGuide, "県選管・投票の方法"],
    ];
    return `<div class="panel"><h3>公式資料</h3><ul class="documents">${official.map(([u, t]) => `<li>${link(u, t)}</li>`).join("")}</ul></div>`;
  }
  function methodResults() {
    const municipalities = new Set(
      records.map((r) => r.place).filter((p) => p !== "埼玉県"),
    ).size;
    const stats = `<div class="project-stats"><span><b>${count(records.length)}</b>本人別の掲載項目</span><span><b>${municipalities}</b>市町村の個別活動</span><span><b>${D.districts.length}</b>県議選挙区</span></div>`;
    const sessionGroups = new Map();
    for (const s of D.sessions) {
      const name = s.place || "埼玉県";
      if (!sessionGroups.has(name)) sessionGroups.set(name, []);
      sessionGroups.get(name).push(s);
    }
    const coverage = recordPlace(sorted([...sessionGroups.keys()]))
      .map((p) => {
        const ss = sessionGroups.get(p) || [];
        return `<details class="coverage"><summary>${esc(p)}議会　資料 ${ss.length}件</summary><ul>${ss.map((s) => `<li>${link(s.url, s.label)}　${s.category ? esc(s.category) + "　" : ""}${s.count != null ? "収録" + count(s.count) + "項目" : ""}${s.note ? "<div class='small'>" + esc(s.note) + "</div>" : ""}</li>`).join("")}</ul></details>`;
      })
      .join("");
    const prereq = `<div class="panel"><h3>議会ごとに揃う資料が違います</h3><p>県議会の本会議は2023年6月から2026年9月までの14定例会。予算特別委員会は2024・2025・2026年の総括質疑項目を別に収録しています。県議の現職名簿は${esc(date(D.rosterDate))}掲載の会派別名簿と選挙区別名簿を照合しました。</p><p>市町村の名簿は、各議会の名簿ページと名簿PDFの掲載者を収録。資料日を特定できる場合は各人の欄に示します。熊谷市は議会だより、さいたま市は議会の録画目次を、改選後の各14定例会について照合しました。ほかの市町村は下の会期別一覧で掲載範囲を確認できます。通告だけの資料は「通告」と表示し、資料が月単位なら年月までを示します。</p></div>`;
    const principles = `<div class="panel"><h3>何を1件と数えるか</h3><p>質問は議会が掲げた項目ごと、共同提出は議案書に氏名のある提出者ごとに1件です。画面では同じ議会・氏名・日付・種類・出典の項目をまとめます。議会や会期によって質問枠・見出しの細かさ・資料の公開方法が異なるため、件数を個人の成績には換算しません。</p><p>会派の賛否は県議会の原表の列単位です。2024年・2025年2月定例会の原表に賛否確認を行わなかった注記だけがある案件は表決行の集計外です。現職名簿にいない当時の議員も、発言時の記録に残します。住民相談、会派内の調整、公開されていない働きかけは集計の対象外です。</p></div>
    <div class="panel"><h3>「提案した」と「実施した」の間</h3><p>取り組みの経過は、質問、答弁、検討、議決、実施を別々に記録しています。各段階に本人、議会、行政、当事者団体など資料に登場する主体を示します。継続して問い直した過程や、複数人が分担した仕事も対象です。</p><p>議会名簿は在職、政党発表は公認・推薦、選管の届出は立候補の根拠として使い分けます。新人や無所属の人にも同じ資料基準を用います。</p></div>`;
    const correction = `<div class="panel"><h3>資料の追加・訂正</h3><p>訂正には議会名、氏名、資料日、原文のURL・頁、訂正箇所を添えてください。リポジトリにアクセスできる方はIssueまたは変更提案で受け付けます。</p><div class="links">${link("https://github.com/sakurasaku1213/saitama-election-2027/issues", "リポジトリのIssues")}${jump("areas", {}, "63市町村の公式窓口")}</div></div>`;
    results(
      stats +
        `<div class="source-stack">${prereq}${principles}${policyReviewMethod()}</div><h3 class="section-title">活動資料の収録範囲</h3>${coverage}<h3 class="section-title">出典と訂正</h3><div class="grid">${sourcesPanel()}${correction}</div>`,
    );
  }

  let attachedQuestionBodies;
  function questionBodies() {
    if (attachedQuestionBodies === undefined) {
      const payload = get("question-text-bodies");
      attachedQuestionBodies = payload ? JSON.parse(payload.textContent) : {};
    }
    return attachedQuestionBodies;
  }
  function questionTextControls() {
    section("質問・答弁の資料", "2026年の春・初夏・秋の会議録、発言通告、録画の文字起こしなどを議会と会期から探せます。");
    filters([
      searchField("例　議員名、会期、会議録"),
      field("place", "議会", placeList(personPlaces)),
      field("season", "2026年の時期", seasons2026, "全期間"),
      field("documentType", "資料の種類", sorted(D.questionText.documents.map((d) => d.kind))),
    ]);
  }
  function questionTextCard(entry, open = false) {
    const doc = `<div class="meta"><span>${esc(entry.place)}議会</span>${dateTag(entry.date)}${tag(entry.kind)}</div><h3>${esc(entry.title)}</h3>`;
    const speakerLabel = entry.scope === "recording" ? "録画一覧の質問者" :
      entry.scope === "notice" ? "通告に掲載された質問者" : "本文に名前がある議員";
    const source = `<div class="links">${link(entry.url, "公式資料の該当箇所")}</div>
      ${entry.note ? `<p class="small">${esc(entry.note)}</p>` : ""}
      ${entry.speakers?.length ? `<p class="small">${speakerLabel}　${entry.speakers.map(esc).join("、")}</p>` : ""}`;
    const available = Boolean(get("question-text-bodies"));
    return `<details class="entry question-document" data-question-id="${esc(entry.id)}"${open ? " open" : ""}>
      <summary><div>${doc}</div></summary><div class="detail-body">${source}
      ${available ? '<div class="question-body" data-question-body></div>' : ""}
      </div></details>`;
  }
  function questionTextResults() {
    const query = terms();
    const hits = D.questionText.documents.filter((d) =>
      matches("doc", d.id) && filteredBody(d.place) && matches("season", d.season) &&
      matches("documentType", d.kind) && includes([d.place, d.title, d.date, d.kind, ...d.speakers], query),
    );
    const selected = state.place ? coveragePanel(state.place, state.season) : "";
    const open = hits.length === 1 && (state.doc === hits[0].id || state.q === hits[0].date);
    results(
      selected + (hits.length ? partial(hits, (entry) => questionTextCard(entry, open)) :
        noResult("該当する本文は現在の資料一覧にありません。議会を選ぶと公式資料と収録状況を確認できます。")),
      `該当する資料 ${count(hits.length)}件`,
    );
    if (open) renderQuestionBody(get("results").querySelector(".question-document"));
  }
  function questionBodyBlock([caption, message], locator) {
    const block = document.createElement("section");
    if (locator || caption) {
      const label = document.createElement("h5");
      label.textContent = locator || caption;
      block.append(label);
    }
    const body = document.createElement("p");
    body.textContent = message;
    block.append(body);
    return block;
  }
  function renderQuestionBody(card) {
    if (!card.open) return;
    const target = card.querySelector("[data-question-body]");
    if (!target || target.childElementCount) return;
    const stored = questionBodies()[card.dataset.questionId];
    if (!stored) return;
    const column = document.createElement("div");
    const heading = document.createElement("h4");
    heading.textContent = "資料本文";
    column.append(heading);
    const positions = state.doc === card.dataset.questionId
      ? [...new Set((state.blocks || "").split(",").map(Number))].filter((n) =>
        Number.isInteger(n) && n > 0 && n <= stored.length)
      : [];
    if (positions.length) {
      const scope = D.questionText.documents.find((doc) => doc.id === card.dataset.questionId)?.scope;
      const paper = scope === "summary";
      const recording = scope === "recording";
      const full = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = paper ? "紙面要旨の全体を読む" : recording ? "字幕・文字起こしの全体を読む" : "会議録の全本文を読む";
      full.append(summary);
      for (const position of positions) {
        const block = stored[position - 1];
        const locator = paper || recording || /^PDF \d+頁$|^議案第|君$/.test(block[0]) ? block[0] : `会議録の発言順 ${position}`;
        column.append(questionBodyBlock(block, locator));
      }
      for (const block of stored) full.append(questionBodyBlock(block));
      column.append(full);
    } else {
      for (const block of stored) column.append(questionBodyBlock(block));
    }
    target.append(column);
  }


  function renderControls() {
    const controls = {
      records: recordControls,
      texts: questionTextControls,
      cases: caseControls,
      people: personControls,
      votes: voteControls,
      areas: areaControls,
      election: electionControls,
    };
    if (page === "method") {
      get("controls").innerHTML = "";
      section("資料と集計", "掲載範囲、数え方、編集上の判断を公開しています。");
    } else controls[page]();
  }
  function renderResults() {
    ({
      records: recordResults,
      texts: questionTextResults,
      cases: caseResults,
      people: personResults,
      votes: voteResults,
      areas: areaResults,
      election: electionResults,
      method: methodResults,
    })[page]();
  }
  const menuButton = get("menu-toggle");
  function setMenu(open) {
    menuButton.setAttribute("aria-expanded", String(open));
    get("menu-label").textContent = open ? "閉じる" : "メニュー";
    get("site-nav").classList.toggle("is-open", open);
  }
  menuButton.addEventListener("click", () =>
    setMenu(menuButton.getAttribute("aria-expanded") !== "true"),
  );
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menuButton.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      menuButton.focus();
    }
  });
  smallScreen.addEventListener("change", () => setMenu(false));
  get("site-nav").addEventListener("click", (event) => {
    const item = event.target.closest("a");
    if (item && location.hash === item.hash) {
      setMenu(false);
      get("workspace").focus();
    }
  });
  document.querySelector(".skip").addEventListener("click", (event) => {
    event.preventDefault();
    setMenu(false);
    get("workspace").focus();
    get("workspace").scrollIntoView({ block: "start" });
  });
  get("home-search").addEventListener("submit", (event) => {
    event.preventDefault();
    location.hash = routeLink("records", { q: get("home-query").value.trim() });
  });
  function renderHomeCases() {
    const chosen = [
      D.cases.find((c) => c.title.includes("手話言語条例")),
      D.cases.find((c) => c.title.includes("かすかべ夢の森公園")),
    ].filter(Boolean);
    get("home-cases").innerHTML = `<div class="feature-pair">${chosen
      .map(
        (c) =>
          `<a href="${esc(routeLink("cases", { place: c.place, q: c.title }))}"><span class="meta">${tag(c.topic)}　${esc(c.place)}議会</span><strong>${esc(c.title)}</strong><span class="small">${esc(c.steps[0].date.slice(0, 4))}年からの記録　·　${c.steps.length}段階</span></a>`,
      )
      .join("")}</div>`;
  }
  function route(scroll = false) {
    const [target, query = ""] = location.hash.slice(1).split("?");
    const home = !target || target === "top";
    page = pages.includes(target) ? target : aliases[target] || "records";
    state = Object.fromEntries(new URLSearchParams(query));
    limit = 15;
    filtersExpanded = null;
    setMenu(false);
    get("home").hidden = !home;
    get("directory").hidden = home;
    document.querySelectorAll("#main-nav a").forEach((a) => {
      if (a.hash === "#" + (home ? "top" : page))
        a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (home) {
      renderHomeCases();
      document.title = "埼玉 議会と選挙｜2027年統一地方選";
    } else {
      renderControls();
      renderResults();
      const title = get("intro").querySelector("h1").textContent;
      get("crumb-current").textContent = title;
      document.title = title + "｜埼玉 議会と選挙 2027";
    }
    if (scroll) {
      window.scrollTo(0, 0);
      get("workspace").focus({ preventScroll: true });
    }
  }
  get("results").addEventListener("toggle", (event) => {
    if (event.target.matches(".question-document")) renderQuestionBody(event.target);
  }, true);
  get("controls").addEventListener(
    "toggle",
    (e) => {
      if (e.target.matches(".refine") && e.target.isConnected)
        filtersExpanded = e.target.open;
    },
    true,
  );
  function searchInput(field) {
    if (page === "texts") {
      delete state.doc;
      delete state.blocks;
    }
    setState("q", field.value);
    get("controls")
      .querySelectorAll("[data-topic]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(state.q === b.dataset.topic)),
      );
    updateFilterState();
    renderResults();
  }
  get("controls").addEventListener("input", (e) => {
    if (e.target.dataset.filter === "q" && !e.isComposing)
      searchInput(e.target);
  });
  get("controls").addEventListener("compositionend", (e) => {
    if (e.target.dataset.filter === "q") searchInput(e.target);
  });
  get("controls").addEventListener("submit", (e) => {
    e.preventDefault();
    searchInput(get("query"));
    get("feedback").focus();
    get("feedback").scrollIntoView({ block: "start" });
  });
  get("controls").addEventListener("change", (e) => {
    const k = e.target.dataset.filter;
    if (!k || k === "q") return;
    if (page === "texts") {
      delete state.doc;
      delete state.blocks;
    }
    if (k === "place" && page === "votes") delete state.session;
    if (k === "place" && page === "people") {
      delete state.group;
      delete state.a;
      delete state.b;
    }
    filtersExpanded = get("controls").querySelector(".refine").open;
    setState(k, e.target.value);
    updateFilterState();
    if (k === "place" && ["people", "votes"].includes(page)) {
      renderControls();
      get("controls").querySelector('[data-filter="place"]').focus();
    }
    renderResults();
  });
  get("controls").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-reset")) {
      state = {};
      history.replaceState(null, "", routeLink(page));
      limit = 15;
      renderControls();
      renderResults();
      get("query").focus();
    }
    if (b.hasAttribute("data-topic")) {
      setState("q", state.q === b.dataset.topic ? "" : b.dataset.topic);
      renderControls();
      renderResults();
      Array.from(get("controls").querySelectorAll("[data-topic]"))
        .find((x) => x.dataset.topic === b.dataset.topic)
        ?.focus();
    }
  });
  get("results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-more]");
    if (b) {
      const old = limit;
      limit += 15;
      renderResults();
      const nodes = get("results").querySelectorAll(
        ":scope > .grid > *, :scope > .list > *",
      );
      const next = nodes[old];
      if (next) {
        next.tabIndex = -1;
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest" });
      }
    }
  });
  get("results").addEventListener("change", (e) => {
    const k = e.target.dataset.compare;
    if (k) {
      setState(k, e.target.value);
      renderResults();
      const box = get("results").querySelector(".compare");
      updateFilterState();
      box.open = true;
      box.querySelector('[data-compare="' + k + '"]').focus();
    }
  });
  window.addEventListener("hashchange", () => route(true));
  if (document.body.hasAttribute("data-portable")) {
    const save = document.createElement("a");
    save.href = location.href.split("#")[0];
    save.download = "saitama-election-2027.html";
    save.textContent = "この版を単一HTMLで保存";
    document.querySelector(".foot").append(save);
  }
  route();
})();
