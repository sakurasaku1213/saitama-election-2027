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
for (const c of data.cases) {
  let previous = "";
  assert.ok(allBodies.has(c.place) && c.actors.length && c.steps.length > 1);
  for (const step of c.steps) {
    validDay(step.date);
    validLink(step.url);
    assert.ok(
      step.actor &&
        step.sourceTitle &&
        step.detail &&
        step.date >= previous &&
        step.date <= data.asOf,
      c.title,
    );
    previous = step.date;
  }
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
      announcementRows: data.nominations.length,
    },
    null,
    2,
  ),
);
