import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(path.join(root, name), "utf8");
const context = vm.createContext({});
context.window = context;
const scripts = [
  ...read("index.html").matchAll(/<script\s+src="([^"]+)"\s*>/g),
].map((m) => m[1]);
const dataScripts = scripts.filter((name) => name.startsWith("data/"));
assert.equal(dataScripts[0], "data/catalog.js");
assert.equal(new Set(scripts).size, scripts.length);
assert.deepEqual(
  dataScripts.slice().sort(),
  readdirSync(path.join(root, "data"))
    .filter((n) => n.endsWith(".js"))
    .map((n) => "data/" + n)
    .sort(),
);
for (const script of dataScripts)
  vm.runInContext(read(script), context, { filename: script });
new vm.Script(read("assets/app.js"));
const data = context.GIKAI;
const sites = new Set(data.areas.map((a) => a.name));
const allBodies = new Set(["埼玉県", ...sites]);
assert.equal(sites.size, 63);
assert.equal(data.areas.length, sites.size);
function validLink(value) {
  assert.ok(value && /^https?:$/.test(new URL(value).protocol), String(value));
}
function validDay(value) {
  assert.match(value, /^\d{4}-\d{2}(?:-\d{2})?$/);
  const day = value.length === 7 ? value + "-01" : value;
  assert.equal(new Date(day + "T00:00:00Z").toISOString().slice(0, 10), day);
}
for (const a of data.areas) {
  validDay(a.termEnd);
  const expected =
    a.termEnd >= "2027-03-01" && a.termEnd <= "2027-05-31"
      ? a.name === "さいたま市"
        ? "early"
        : "late"
      : "other";
  assert.equal(a.phase, expected, a.name);
  for (const key of [
    "councilURL",
    "rosterURL",
    "recordsURL",
    "bulletinURL",
    "billsURL",
    "electionURL",
    "sourceURL",
  ])
    validLink(a[key]);
  const stats = data.stats.municipalities[a.name];
  assert.equal(stats.counts.length, data.stats.groups.length);
  assert.equal(
    stats.counts.reduce((n, v) => n + v, 0) + stats.vacant,
    stats.seats,
  );
}
const people = new Set();
for (const p of data.members) {
  assert.ok(allBodies.has(p.place) && p.name, p.name);
  validLink(p.url);
  const key = p.place + "|" + p.name.replace(/\s/g, "");
  assert.ok(!people.has(key), "Duplicate member " + key);
  people.add(key);
}
assert.equal(new Set(data.members.map((p) => p.place)).size, allBodies.size);
const records = new Set(),
  bodies = new Set(),
  actors = new Set();
for (const batch of data.activity) {
  assert.ok(allBodies.has(batch.place) && batch.sourceTitle, batch.place);
  for (const [name, day, kind, title, url, , proposal] of batch.rows) {
    validDay(day);
    validLink(url);
    assert.ok(
      day <= data.asOf && name && kind && title,
      [day, name, title].join(" "),
    );
    const key = [
      batch.place,
      name,
      day,
      kind,
      title,
      url,
      batch.sourceTitle,
    ].join("\0");
    assert.ok(!records.has(key), "Duplicate activity " + key);
    records.add(key);
    bodies.add(batch.place);
    actors.add(batch.place + "|" + name);
    for (const field of ["recordingURL", "noticeURL", "originalUrl"]) {
      if (proposal?.[field]) validLink(proposal[field]);
    }
    if (proposal?.joint) {
      validLink(proposal.resultURL);
      assert.ok(proposal.joint.includes(name));
    }
  }
}
assert.equal(bodies.size, allBodies.size, "Missing local activity coverage");
for (const s of data.sessions) {
  validLink(s.url);
  assert.ok(allBodies.has(s.place) && s.label);
}
const archivedQuestionDocs = new Map(data.questionText.documents.map((doc) => [doc.id, doc]));
function appearedInNamedVote(place, day, name) {
  const session = data.coverage2026.sessions.find((slot) =>
    slot.place === place && !slot.planned && slot.fromDate && slot.toDate &&
    slot.fromDate <= day && day <= slot.toDate);
  return session && data.coverage2026.decisions.some((bill) =>
    bill.place === place && bill.season === session.season && bill.voteType === "記名" &&
    Object.hasOwn(bill.votes || {}, name));
}
let documentedMemberActions = 0;
for (const c of data.cases) {
  let previous = "";
  const casePlaces = [c.place, ...(c.relatedPlaces || [])];
  assert.ok(c.actors.length && c.steps.length > 1);
  assert.equal(new Set(casePlaces).size, casePlaces.length, c.title);
  assert.ok(casePlaces.every((place) => allBodies.has(place)), c.title);
  for (const step of c.steps) {
    const place = step.place || c.place;
    assert.ok(casePlaces.includes(place), c.title);
    validDay(step.date);
    validLink(step.url);
    if (step.billNumber) {
      const matchingSessions = new Set(data.coverage2026.sessions.filter((slot) =>
        slot.place === place && !slot.planned && step.date.length === 7 &&
        (slot.fromDate.startsWith(step.date) || slot.toDate.startsWith(step.date)),
      ).map((slot) => slot.season));
      assert.equal(data.coverage2026.decisions.filter((bill) =>
        bill.place === place && bill.number === step.billNumber &&
        (bill.date === step.date || (!bill.date && matchingSessions.has(bill.season))),
      ).length, 1, c.title);
    }
    assert.ok(
      step.actor &&
        step.sourceTitle &&
        step.detail &&
        step.date >= previous &&
        step.date <= data.coverage2026.checked,
      c.title,
    );
    const doc = step.archiveId ? archivedQuestionDocs.get(step.archiveId) : null;
    if (step.archiveId) {
      const publishedCaption = doc?.scope === "recording" && doc.kind === "公式録画の公開自動字幕";
      assert.ok(doc?.place === place && (["minutes", "summary"].includes(doc.scope) || publishedCaption), c.title);
      assert.equal(doc.url.split("#")[0], step.url.split("#")[0], c.title);
      const monthlySource = doc.date.length === 7 &&
        (doc.scope === "summary" || doc.kind === "公式会議録PDFのOCR転記");
      const inSummarySession = monthlySource && doc.scope === "summary" && step.date.length === 10 &&
        data.coverage2026.sessions.some((slot) => slot.place === place && slot.season === doc.season &&
          !slot.planned && slot.fromDate && slot.toDate && step.date >= slot.fromDate && step.date <= slot.toDate);
      assert.ok(doc.date === step.date || (monthlySource && doc.date === step.date.slice(0, 7)) || inSummarySession, c.title);
    }
    if (step.blocks) {
      assert.ok(doc && step.blocks.length && step.blocks.every((block, index) =>
        Number.isSafeInteger(block) && block > (step.blocks[index - 1] || 0)), c.title);
    }
    const names = new Set();
    for (const action of step.memberActions || []) {
      assert.ok(!names.has(action.name) && c.actors.includes(action.name) && action.detail, c.title);
      assert.ok(step.actor.split("、").includes(action.name) || step.archiveId, c.title);
      const listedMember = people.has(place + "|" + action.name.replace(/\s/g, ""));
      const recordedMember = doc?.scope === "minutes" && doc.speakers.includes(action.name);
      assert.ok(listedMember || recordedMember || appearedInNamedVote(place, step.date, action.name), action.name);
      if (step.archiveId) {
        assert.ok(action.blocks?.length && action.blocks.every((block, index) =>
          Number.isSafeInteger(block) && block > (action.blocks[index - 1] || 0)), action.name);
        if (doc.scope !== "minutes") assert.ok(doc.speakers.includes(action.name), action.name);
      } else {
        assert.equal(action.blocks, undefined, action.name);
      }
      names.add(action.name);
      documentedMemberActions++;
    }
    previous = step.date;
  }
}
const review = data.policyReview;
validDay(review.through);
validDay(review.checked);
assert.ok(review.through <= review.checked && review.coverageNote);
for (const source of review.sources) {
  validLink(source.url);
  assert.ok(source.label);
}
const sourceQuestions = new Map();
for (const batch of data.activity) {
  if (batch.place !== review.place || batch.sourceTitle !== review.questionSource) continue;
  for (const [name, date, kind, title, url] of batch.rows) {
    assert.ok(!sourceQuestions.has(url) && ["一般質問", "代表質問"].includes(kind), url);
    sourceQuestions.set(url, { name, date, title });
  }
}
const reviewSession = data.sessions.find((session) =>
  session.place === review.place && session.label === review.label && session.url === review.sources[0].url,
);
assert.equal(sourceQuestions.size, reviewSession.count, "Source item count");
const reviewed = new Map();
const reviewSpeakers = new Set();
const reviewLevels = new Set(["specific", "general", "unknown"]);
const followUpStates = new Set(["confirmed", "searched", "incomplete", "open"]);
for (const issue of review.issues) {
  assert.ok(issue.items.length && followUpStates.has(issue.followUp), issue.name);
  assert.ok(people.has(review.place + "|" + issue.name.replace(/\s/g, "")), issue.name);
  reviewSpeakers.add(issue.name);
  const itemUrls = new Set();
  const questionDays = [];
  for (const item of issue.items) {
    const question = sourceQuestions.get(item.url);
    assert.equal(question?.name, issue.name, item.url);
    assert.ok(!itemUrls.has(item.url) && reviewLevels.has(item.level) && item.reason, item.url);
    itemUrls.add(item.url);
    questionDays.push(question.date);
    if (!reviewed.has(item.url)) reviewed.set(item.url, []);
    reviewed.get(item.url).push(issue);
  }
  questionDays.sort();
  const reviewedText = issue.items.filter((item) => item.level !== "unknown");
  for (const item of reviewedText) {
    assert.ok(issue.outcomes?.some((entry) =>
      entry.url === item.url && entry.date === sourceQuestions.get(item.url).date
    ), "Missing original answer: " + item.url);
  }
  assert.equal(issue.followUp === "confirmed", Boolean(issue.actions?.length), issue.name);
  if (issue.followUp === "incomplete" || issue.followUp === "open") {
    assert.ok(issue.followUpNote, issue.name);
  }
  for (const timeline of [issue.actions, issue.outcomes]) {
    let previous = "";
    for (const entry of timeline || []) {
      validDay(entry.date);
      validLink(entry.url);
      assert.ok(entry.sourceTitle && entry.locator && entry.stage && entry.actor && entry.detail, entry.url);
      assert.ok(entry.date >= previous && entry.date <= review.through, entry.url);
      previous = entry.date;
    }
  }
  for (const action of issue.actions || []) {
    assert.ok(action.date > questionDays.at(-1), action.url);
    assert.equal(action.actor, issue.name + "議員", action.url);
    assert.ok(!sourceQuestions.has(action.url), action.url);
  }
}
assert.equal(reviewed.size, sourceQuestions.size, "Missing reviewed source item");
assert.equal(reviewSpeakers.size, reviewSession.appearances, "Missing reviewed speaker");
for (const [url, issues] of reviewed) {
  if (issues.length < 2) continue;
  const titles = new Set(issues.map((issue) => issue.title).filter(Boolean));
  assert.equal(titles.size, issues.length, "Explain how the shared source item is split: " + url);
}
const coverage = data.coverage2026;
validDay(coverage.checked);
const coverageSlots = new Map();
const seasons = new Set(["spring", "summer", "fall"]);
const materialKeys = ["activity", "decisions", "meeting", "policy", "text", "votes"];
const materialStates = new Set(["verified", "partial", "identified", "unavailable", "notFound", "noSession", "pending"]);
for (const row of coverage.sessions) {
  assert.ok(allBodies.has(row.place) && seasons.has(row.season) && row.label);
  const key = row.place + "|" + row.season;
  assert.ok(!coverageSlots.has(key), key);
  coverageSlots.set(key, row);
  assert.equal(Object.keys(row.materials).sort().join(), materialKeys.join(), key);
  assert.ok(Object.values(row.materials).every((m) => materialStates.has(m.state) && m.note), key);
  assert.ok(row.sources.length && new Set(row.sources.map((source) => source.url)).size === row.sources.length, key);
  for (const source of row.sources) {
    validLink(source.url);
    assert.ok(source.label);
  }
  if (row.fromDate) validDay(row.fromDate);
  if (row.toDate) {
    validDay(row.toDate);
    assert.ok(row.fromDate && row.fromDate <= row.toDate, key);
  }
}
assert.equal(coverageSlots.size, allBodies.size * seasons.size);
const councilReviews = new Map();
let councilReviewAppearances = 0;
let councilReviewIssues = 0;
let councilReviewActions = 0;
let councilQuestionIntents = 0;
const questionIntents = new Set(["proposal", "verification", "facts", "general"]);
function validBlocks(item) {
  assert.ok(item.locator && item.blocks.length, item.url);
  assert.ok(item.blocks.every((block, index, blocks) =>
    Number.isSafeInteger(block) && block > (blocks[index - 1] || 0)), item.url);
}
for (const comparison of data.councilPolicyReviews) {
  assert.ok(allBodies.has(comparison.place) && !councilReviews.has(comparison.place), comparison.place);
  councilReviews.set(comparison.place, comparison);
  validDay(comparison.through);
  const followThrough = comparison.followThrough || comparison.through;
  validDay(followThrough);
  validDay(comparison.checked);
  validLink(comparison.indexURL);
  assert.ok(comparison.note && comparison.through <= followThrough && followThrough <= comparison.checked);
  const appearances = new Map();
  for (const item of comparison.appearances) {
    assert.ok(!appearances.has(item.id) && item.name, item.id);
    assert.ok(coverageSlots.has(comparison.place + "|" + item.season), item.id);
    validDay(item.date);
    validLink(item.url);
    assert.ok(item.date <= comparison.through, item.id);
    assert.ok(people.has(comparison.place + "|" + item.name.replace(/\s/g, "")), item.name);
    appearances.set(item.id, item);
  }
  const issued = new Map();
  const reached = new Set();
  let classified = 0;
  for (const issue of comparison.issues) {
    assert.ok(issue.id && issue.title && !issued.has(issue.id), issue.id);
    issued.set(issue.id, issue);
    assert.ok(issue.items.length && issue.outcomes.length && followUpStates.has(issue.followUp));
    if (issue.caseTitle) {
      const related = data.cases.find((item) =>
        [item.place, ...(item.relatedPlaces || [])].includes(comparison.place) && item.title === issue.caseTitle);
      assert.ok(related?.actors.includes(issue.name), issue.id);
    }
    assert.equal(issue.followUp === "confirmed", Boolean(issue.actions?.some((event) => !event.repeatedRequest)), issue.id);
    const references = new Set();
    for (const item of issue.items) {
      const source = appearances.get(item.sourceId);
      assert.ok(source && issue.name === source.name, item.sourceId);
      assert.equal(item.url, source.url);
      assert.equal(item.date, source.date);
      assert.equal(item.season, source.season);
      assert.ok(reviewLevels.has(item.level) && item.reason && item.title && item.kind);
      if (comparison.classifiedQuestions) {
        assert.ok(questionIntents.has(item.intent) && item.intentReason, issue.id + " " + item.sourceId);
        classified++;
      }
      assert.ok(!references.has(item.sourceId), issue.id);
      validBlocks(item);
      references.add(item.sourceId);
      reached.add(item.sourceId);
    }
    for (const timeline of [issue.outcomes, issue.actions || []]) {
      let lastDate = "";
      for (const event of timeline) {
        validDay(event.date);
        validLink(event.url);
        validBlocks(event);
        assert.ok(event.stage && event.actor && event.detail && event.sourceTitle, issue.id);
        assert.ok(event.date >= lastDate && event.date <= (event.archiveId ? followThrough : comparison.through), issue.id);
        if (event.archiveId) {
          const doc = archivedQuestionDocs.get(event.archiveId);
          assert.ok(doc?.scope === "minutes" && doc.place === comparison.place, issue.id);
          assert.equal(event.url, doc.url);
          assert.equal(event.date, doc.date);
        }
        lastDate = event.date;
      }
    }
    for (const event of issue.actions || []) {
      assert.equal(event.actor, issue.name);
      if (event.repeatedRequest !== undefined) assert.equal(event.repeatedRequest, true, issue.id);
      if (event.archiveId) {
        assert.ok(!event.sourceId && archivedQuestionDocs.get(event.archiveId).speakers.includes(issue.name), issue.id);
        assert.ok(issue.items.some((item) => item.date < event.date), issue.id);
      } else {
        const source = appearances.get(event.sourceId);
        assert.ok(source && references.has(source.id), issue.id);
        assert.equal(event.url, source.url);
        assert.equal(event.date, source.date);
        assert.ok(issue.items.some((item) => item.date < event.date && item.season !== source.season));
      }
      if (!event.repeatedRequest) councilReviewActions++;
    }
  }
  assert.equal(reached.size, appearances.size, comparison.place + " missing listed questions");
  councilReviewAppearances += appearances.size;
  councilReviewIssues += issued.size;
  if (comparison.classifiedQuestions) assert.equal(classified, comparison.classifiedQuestions);
  councilQuestionIntents += classified;
}
const kawagoe = councilReviews.get("川越市");
for (const [period, listed] of [["spring", 32], ["summer", 30], ["fall", 31]]) {
  assert.equal(kawagoe.appearances.filter((item) => item.season === period).length, listed);
}
const currentPlaces = new Set();
for (const row of coverage.current) {
  assert.ok(allBodies.has(row.place) && !currentPlaces.has(row.place), row.place);
  currentPlaces.add(row.place);
  validLink(row.roster.source);
  validLink(row.election.source);
  assert.ok(row.roster.matched >= 0 && row.roster.baseline >= row.roster.matched);
  assert.equal(row.roster.baseline, data.members.filter((m) => m.place === row.place).length);
}
assert.equal(currentPlaces.size, allBodies.size);
const addedDecisions = new Set();
for (const bill of coverage.decisions) {
  const slot = coverageSlots.get(bill.place + "|" + bill.season);
  const reference = bill.number || bill.resultLocator;
  const key = [bill.place, bill.session, reference].join("|");
  assert.ok(slot && typeof reference === "string" && reference.trim() && bill.title && bill.result, key);
  assert.ok(!addedDecisions.has(key), key);
  addedDecisions.add(key);
  if (bill.date) validDay(bill.date);
  validLink(bill.resultURL);
  validLink(bill.url);
  if (bill.archiveId) {
    const doc = archivedQuestionDocs.get(bill.archiveId);
    assert.ok(doc?.place === bill.place && doc.scope === "minutes" && doc.date === bill.date, key);
    assert.ok(bill.blocks?.length && bill.blocks.every((block, index) =>
      Number.isSafeInteger(block) && block > (bill.blocks[index - 1] || 0)), key);
  }
  if (bill.proposalSupporterLabel) {
    assert.ok(bill.proposalSupporters?.length && bill.archiveId, key);
  }
  if (bill.followUp) {
    const { date, result, session, url } = bill.followUp;
    validDay(date);
    assert.ok(bill.date && date > bill.date && date <= coverage.checked && result && session, key);
    validLink(url);
  }
  if (bill.committeeURL) validLink(bill.committeeURL);
  if (bill.proposalRole) assert.ok(bill.proposalRole === "発議者" && bill.names?.length, key);
  if (bill.proposalSupporters) {
    assert.ok(bill.names?.length && bill.proposalSupporters.length, key);
    assert.equal(new Set(bill.proposalSupporters).size, bill.proposalSupporters.length, key);
    const memberProposal = bill.proposalRole === "発議者" && bill.sourceTitle === "議員提出議案の原文" &&
      bill.url !== bill.resultURL && /\.pdf#page=\d+$/i.test(bill.url);
    for (const supporter of bill.proposalSupporters) {
      assert.ok(typeof supporter === "string" && supporter.trim() && !bill.names.includes(supporter), key);
      assert.ok(people.has(bill.place + "|" + supporter.replace(/\s/g, "")) || memberProposal ||
        (bill.date && appearedInNamedVote(bill.place, bill.date, supporter)), key);
    }
  }
  if (bill.votes) {
    assert.ok(bill.voteType && Object.keys(bill.votes).length);
    validLink(bill.voteURL);
  }
  if (bill.voteConflicts) {
    assert.ok(bill.voteNote && bill.voteConflicts.length && bill.votes, key);
    assert.equal(new Set(bill.voteConflicts).size, bill.voteConflicts.length, key);
    assert.ok(bill.voteConflicts.every((name) => Object.hasOwn(bill.votes, name)), key);
    validLink(bill.voteConflictURL);
  }
}
const matsubushiVotes = coverage.decisions.filter((bill) => bill.place === "松伏町" && bill.season === "fall");
assert.equal(matsubushiVotes.length, 20);
for (const bill of matsubushiVotes) {
  assert.equal(Object.keys(bill.votes).length, 12, bill.number);
  assert.ok(Object.values(bill.votes).every((vote) =>
    ["賛成", "反対", "欠席", "提出者"].includes(vote)), bill.number);
  const presenters = Object.entries(bill.votes).filter(([, vote]) => vote === "提出者");
  assert.equal(presenters.length, bill.number.startsWith("発議") ? 1 : 0);
  if (presenters.length) assert.equal(presenters[0][0], bill.proposer);
}
const kazoDecisions = coverage.decisions.filter((bill) => bill.place === "加須市" && bill.season === "fall");
assert.equal(kazoDecisions.length, 29);
const kazoRecordedVotes = kazoDecisions.filter((bill) => bill.votes);
assert.equal(kazoRecordedVotes.length, 16);
for (const bill of kazoRecordedVotes) {
  const positions = Object.values(bill.votes);
  assert.equal(positions.length, 25, bill.number);
  assert.equal(positions.filter((position) => position === "欠席").length, 1, bill.number);
  assert.equal(bill.votes["金子正則"], "議長（表決不参加）", bill.number);
  assert.equal(positions.filter((position) => position === "趣旨採択").length, bill.number === "請願第5号" ? 2 : 0);
}
for (const [season, decisions, ballots, columns] of [["spring", 43, 8, 12], ["summer", 21, 4, 10], ["fall", 38, 6, 10]]) {
  const records = coverage.decisions.filter((bill) => bill.place === "川越市" && bill.season === season);
  assert.equal(records.length, decisions);
  const published = records.filter((bill) => bill.voteType === "会派等");
  assert.equal(published.length, ballots);
  for (const bill of published) assert.equal(Object.keys(bill.votes).length, columns, bill.number);
}
for (const review of coverage.policy) {
  assert.ok(coverageSlots.has(review.place + "|" + review.season));
  for (const issue of review.issues) {
    const name = review.place + "|" + issue.name.replace(/\s/g, "");
    assert.ok(people.has(name) && issue.items.length && issue.outcomes.length, name);
    for (const item of issue.items) {
      validLink(item.url);
      if (item.recordingURL) validLink(item.recordingURL);
      validDay(item.date);
      assert.ok(item.reason && item.title && reviewLevels.has(item.level));
    }
    for (const outcome of issue.outcomes) {
      validDay(outcome.date);
      validLink(outcome.url);
      assert.ok(outcome.actor && outcome.detail && outcome.locator);
    }
    if (issue.followUp === "confirmed") {
      assert.ok(issue.actions?.length && issue.actions.every((action) => action.actor.includes(issue.name)));
    }
  }
}

const questionDocs = data.questionText.documents;
const questionIds = new Set();
const docCouncilSeasons = new Set();
const questionKeys = new Set();
for (const doc of questionDocs) {
  const slot = doc.place + "|" + doc.season;
  assert.ok(coverageSlots.has(slot));
  assert.match(doc.id, /^[a-f0-9]{20}$/);
  assert.ok(!questionIds.has(doc.id), doc.id);
  const sourceKey = JSON.stringify([doc.place, doc.season, doc.date, doc.url]);
  assert.ok(!questionKeys.has(sourceKey), sourceKey);
  questionIds.add(doc.id);
  questionKeys.add(sourceKey);
  if (doc.scope !== "notice") docCouncilSeasons.add(slot);
  validLink(doc.url);
  validDay(doc.date);
  assert.match(doc.date, /^2026-/);
  assert.ok(doc.title && doc.kind);
  assert.ok(["minutes", "fullQA", "summary", "recording", "notice"].includes(doc.scope));
  if (doc.scope === "notice") {
    assert.ok(["一般質問通告（公式資料）", "議案質疑通告（公式資料・OCR）", "議案質疑・一般質問通告（公式資料）"].includes(doc.kind) && doc.note);
  }
  if (doc.scope === "recording") {
    assert.match(doc.kind, /機械文字起こし|公開自動字幕/);
    const meetingRecording = doc.kind === "公式録画の機械文字起こし" && doc.title === "本会議　議案質疑（録画から）";
    assert.ok(doc.speakers.length || doc.kind === "公式録画の公開自動字幕" || meetingRecording);
  }
  assert.ok(Array.isArray(doc.speakers) && new Set(doc.speakers).size === doc.speakers.length);
}
assert.ok(questionDocs.length >= 808, "Prefecture Q&A texts should be preserved");
for (const row of data.questionText.coverage) {
  assert.ok(coverageSlots.has(row.place + "|" + row.season));
  assert.ok(materialStates.has(row.material.state) && row.material.note);
  if (row.material.indexURL) validLink(row.material.indexURL);
  assert.equal(docCouncilSeasons.has(row.place + "|" + row.season),
    row.material.state === "verified" || row.material.state === "partial", row.place + "|" + row.season);
}
let votes = 0;
for (const v of data.voteSessions) {
  validLink(v.source);
  validLink(v.bills);
  for (const [number, title, day, result, index, values, pdfPage] of v.rows) {
    if (day) validDay(day);
    assert.ok(number && title && result && pdfPage > 0);
    assert.equal(values.length, v.headers[index].length);
    assert.ok(
      values.every((x) => ["○", "〇", "×", "欠", "除", ""].includes(x)),
      number,
    );
    votes++;
  }
}
for (const n of data.nominations) {
  assert.ok(
    n.name && n.status && n.party && allBodies.has(n.place),
    JSON.stringify(n),
  );
  validLink(n.url);
  if (n.date) validDay(n.date);
}
for (const b of data.bills) {
  assert.ok(b.names?.length && b.title);
  validLink(b.url);
  validLink(b.resultURL);
}
for (const v of data.localVotes) {
  validLink(v.url);
  assert.ok(Object.values(v.votes).every(Boolean));
}
console.log(
  JSON.stringify(
    {
      councilsInActivity: bodies.size,
      activities: records.size,
      peopleInActivity: actors.size,
      peopleOnRosters: people.size,
      municipalities: sites.size,
      prefecturalBallotRows: votes,
      jointBills: data.bills.length,
      localRollCalls: data.localVotes.length,
      documentedCases: data.cases.length,
      documentedMemberActions,
      reviewedQuestionItems: reviewed.size,
      reviewedSpeakers: reviewSpeakers.size,
      reviewedPolicyIssues: review.issues.length,
      confirmedFollowUps: review.issues.filter((issue) => issue.followUp === "confirmed").length,
      councilReviewAppearances,
      councilReviewIssues,
      councilReviewActions,
      councilQuestionIntents,
      announcementRows: data.nominations.length,
      coverageCouncils: new Set(coverage.current.map((row) => row.place)).size,
      coverageSlots: coverageSlots.size,
      questionArchiveDocuments: questionDocs.length,
      questionArchiveCouncils: new Set(questionDocs.map((doc) => doc.place)).size,
      questionArchiveSlots: docCouncilSeasons.size,
      questionArchiveNotices: questionDocs.filter((doc) => doc.scope === "notice").length,
      additionalDecisions: coverage.decisions.length,
      additionalRollCalls: coverage.decisions.filter((bill) => bill.votes && bill.voteType !== "会派等").length,
      additionalGroupVotes: coverage.decisions.filter((bill) => bill.voteType === "会派等").length,
      additionalReviewedIssues: coverage.policy.reduce((n, entry) => n + entry.issues.length, 0),
    },
    null,
    2,
  ),
);
