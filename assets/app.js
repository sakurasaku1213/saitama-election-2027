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
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
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
      `<div class="intro"><div><h2>${esc(heading)}</h2><p>${esc(text)}</p></div>${action ? '<div class="intro-link">' + action + "</div>" : ""}</div>`;
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
  const searchField = (placeholder = "氏名・議題・キーワード") =>
    `<label class="search-field">キーワード<input type="search" data-filter="q" value="${esc(state.q || "")}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
  function filters(fields, topics = []) {
    get("controls").innerHTML =
      `<div class="filters">${fields.join("")}<button type="button" class="clear" data-reset>条件を解除</button></div>` +
      (topics.length
        ? `<div class="topics" aria-label="テーマで検索">${topics.map((t) => `<button class="topic-button" type="button" data-topic="${esc(t)}" aria-pressed="${state.q === t}">${esc(t)}</button>`).join("")}</div>`
        : "");
  }
  function results(html, status = "") {
    get("results").innerHTML = html;
    get("feedback").textContent = status;
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
  function recordControls() {
    section(
      "活動を探す",
      "議員名や地域の課題から、質問項目とその原文を探せます。",
      jump("cases", {}, "提案後の経過を読む"),
    );
    filters(
      [
        searchField("例　通学路、予算、議員名"),
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
    const picked = !Object.values(state).some(Boolean)
      ? D.cases.filter((c) =>
          [
            "手話言語条例は誰が案を練り、誰が提出したか",
            "かすかべ夢の森公園の遊具が使えるまで",
          ].includes(c.title),
        )
      : [];
    const featured = picked.length
      ? `<aside class="feature-pair" aria-label="取り組みの経過の例">${picked.map((c) => `<a href="${esc(routeLink("cases", { place: c.place, q: c.title }))}"><span class="small">${esc(c.place)}議会 ・ ${esc(c.topic)}</span><strong>${esc(c.title)}</strong><span class="small">${c.steps.length}段階を原文で読む</span></a>`).join("")}</aside>`
      : "";
    const personFilter = state.name
      ? `<p class="note">氏名で絞り込み中　<strong>${esc(state.name)}</strong>　${jump("records", { ...state, name: "" }, "氏名の指定を解除")}</p>`
      : "";
    results(
      featured +
        personFilter +
        (list.length
          ? partial(list, groupCard)
          : noResult("自治体の会議録も「市町村と日程」から検索できます。")),
      `該当する掲載項目 ${count(n)}件 ・ 議会・氏名・日付・資料ごとのまとまり ${count(list.length)}件`,
    );
  }
  function caseControls() {
    section(
      "取り組みの経過",
      "質問・検討・議決・実施を時系列で読み、各段階を担った人と機関を確認できます。",
    );
    filters([
      searchField("例　手話、議員名、条例"),
      field("place", "議会", placeList(sorted(D.cases.map((c) => c.place)))),
    ]);
  }
  function caseCard(c) {
    const last = c.steps[c.steps.length - 1];
    return `<details class="case"><summary><div><div class="meta">${tag(c.topic)}<span>${esc(c.place)}議会</span><span>${c.steps.length}段階</span></div><h3>${esc(c.title)}</h3><p class="small">${esc(date(c.steps[0].date))} ～ ${esc(date(last.date))}　${esc(last.stage)}</p></div></summary><div class="detail-body"><p><b>資料に登場する人・組織</b>　${c.actors.map(esc).join("、")}</p><ol class="steps">${c.steps.map((s) => `<li>${dateTag(s.date)}　${tag(s.stage)}<strong>${esc(s.actor)}</strong><p>${esc(s.detail)}</p><div class="docs-link">${link(s.url, s.sourceTitle)}</div></li>`).join("")}</ol>${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}</div></details>`;
  }
  function caseResults() {
    const list = D.cases.filter(
      (c) =>
        filteredBody(c.place) &&
        includes([
          c.place,
          c.title,
          c.topic,
          ...c.actors,
          ...c.steps.flatMap((s) => [s.stage, s.actor, s.detail]),
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
  function relatedCases(p) {
    return D.cases.filter(
      (c) =>
        c.place === p.place && c.actors.some((n) => norm(n) === norm(p.name)),
    );
  }
  function personCard(p, compare = false) {
    const work = (byPerson.get(personKey(p.place, p.name)) || []).filter((g) =>
      matchYear(g.date),
    );
    const years = sorted(work.map((g) => g.date.slice(0, 4)));
    const related = relatedCases(p);
    const types = sorted(work.map((g) => g.kind));
    const typeLinks = types.map((kind) =>
      jump(
        "records",
        { place: p.place, name: p.name, kind, year: state.year },
        kind,
      ),
    );
    return `<article class="${compare ? "compare-cell" : "person"}"><div class="meta"><span>${esc(p.place)}議会</span>${p.district ? tag(p.district) : ""}</div><h3>${esc(p.name)}</h3>
      <p>${esc(p.group || "会派は掲載元で確認")}</p>${p.roles?.length ? `<p class="small">委員会等　${p.roles.map(esc).join(" · ")}</p>` : ""}
      ${work.length ? `<p class="group-note">記録のある年　${years.join("・")}年</p><div class="links">${typeLinks.join("")}</div><p class="snippet">直近の掲載項目　${esc(work[0].items[0].title)}</p>` : `<p class="group-note">この期間の収録資料では本人の項目を特定できていません。掲載元の記録も参照できます。</p>`}
      ${related.map((c) => `<div class="story-link">${jump("cases", { place: p.place, q: c.title }, c.title)}</div>`).join("")}
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
      "県議会は会派別表決表、熊谷市議会は議員提出議案の提出者と個人別表決を、議案ごとに確認できます。",
      jump("method", {}, "原表の読み方"),
    );
    filters([
      searchField("例　給食、補正予算、条例"),
      field("place", "議会", [
        ["埼玉県", "埼玉県議会"],
        ["熊谷市", "熊谷市議会"],
      ]),
      field(
        "session",
        "定例会",
        state.place === "熊谷市"
          ? sorted(D.bills.map((b) => b.session)).reverse()
          : [...D.voteSessions].reverse().map((s) => [s.id, s.label]),
      ),
      field("split", "賛否の異同", [["mixed", "賛成・反対の両方あり"]]),
    ]);
  }
  function localBillCard(b) {
    const v = D.localVotes.find(
      (row) => row.session === b.session && row.number === b.number,
    );
    const ballots = v ? Object.entries(v.votes) : [];
    const named = b.names?.length
      ? b.names.map(esc).join("、")
      : "公開資料で提出者を特定できず";
    return `<details class="entry"><summary><div><div class="meta">${tag(b.result)}<span>熊谷市議会</span>${dateTag(b.date)}<span>${esc(b.number)}</span></div><p class="title">${esc(b.title)}</p></div></summary><div class="detail-body"><p>提出者　${named}</p><ul class="ballots">${ballots.map(([name, position]) => `<li><span>${esc(name)}</span><b>${esc(position)}</b></li>`).join("")}</ul><div class="links">${link(b.url, "議案・提出者の原文")}${link(b.resultURL, "審議結果・表決の原表")}</div></div></details>`;
  }
  function voteResults() {
    const prefItems = voteRows.filter(
      (v) =>
        matches("session", v.session.id) &&
        (!state.split ||
          (v.values.includes("×") &&
            v.values.some((x) => x === "○" || x === "〇"))) &&
        includes([v.num, v.title, v.decision, v.session.label]),
    );
    const locals = D.bills.filter(
      (b) =>
        matches("session", b.session) &&
        includes([b.title, b.number, b.result, ...(b.names || [])]) &&
        (!state.split ||
          D.localVotes.some(
            (v) =>
              v.session === b.session &&
              v.number === b.number &&
              Object.values(v.votes).includes("賛成") &&
              Object.values(v.votes).includes("反対"),
          )),
    );
    const list = [
      ...(state.place === "熊谷市" ? [] : prefItems),
      ...(state.place === "埼玉県" ? [] : locals),
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
    const notice = `<p class="note">県の会派欄は議会運営委員会で確認した立場です。熊谷市の欄は市議会が公表した個人別の結果です。継続審査の行はその扱いに関する表決です。空欄・欠席・除斥はそれぞれ原表の区分を保っています。</p>`;
    const requests = D.cityRequests;
    const city =
      requests && state.place !== "熊谷市"
        ? `<details class="coverage"><summary>さいたま市の会派別予算要望と市の回答</summary><p class="small">令和8年度当初予算について、各会派の要望ごとに市の回答を確認できます。</p><div class="links">${link(requests.url, "市が公表した回答書一覧")}${requests.links.map(([t, u]) => link(u, t)).join("")}</div></details>`
        : "";
    results(
      notice + city + (list.length ? partial(list, cards) : noResult()),
      `該当する県の表決行・熊谷市の議員提出議案　${count(list.length)}件`,
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
      schedulePanel() +
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
        `<div class="source-stack">${prereq}${principles}</div><h3 class="section-title">活動資料の収録範囲</h3>${coverage}<h3 class="section-title">出典と訂正</h3><div class="grid">${sourcesPanel()}${correction}</div>`,
    );
  }
  function renderControls() {
    const controls = {
      records: recordControls,
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
      cases: caseResults,
      people: personResults,
      votes: voteResults,
      areas: areaResults,
      election: electionResults,
      method: methodResults,
    })[page]();
  }
  function route(scroll = false) {
    const hash = location.hash.slice(1);
    const [target, query = ""] = hash.split("?");
    page = pages.includes(target) ? target : aliases[target] || "records";
    state = Object.fromEntries(new URLSearchParams(query));
    limit = 15;
    get("hero").hidden = !!target && target !== "top";
    document.querySelectorAll("#main-nav a").forEach((a) => {
      if (a.hash === "#" + page) {
        a.setAttribute("aria-current", "page");
        if (scroll) a.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else a.removeAttribute("aria-current");
    });
    renderControls();
    renderResults();
    document.title =
      (page === "records" && !target
        ? ""
        : get("intro").querySelector("h2").textContent + "｜") +
      "埼玉 議会と選挙 2027";
    if (scroll) {
      window.scrollTo(0, 0);
      get("workspace").focus({ preventScroll: true });
    }
  }
  get("controls").addEventListener("input", (e) => {
    if (e.target.dataset.filter === "q") {
      setState("q", e.target.value);
      get("controls")
        .querySelectorAll("[data-topic]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", state.q === b.dataset.topic),
        );
      renderResults();
    }
  });
  get("controls").addEventListener("change", (e) => {
    const k = e.target.dataset.filter;
    if (!k || k === "q") return;
    if (k === "place" && page === "votes") delete state.session;
    if (k === "place" && page === "people") {
      delete state.group;
      delete state.a;
      delete state.b;
    }
    setState(k, e.target.value);
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
      get("controls").querySelector("input")?.focus();
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
