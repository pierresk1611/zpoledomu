import test from "node:test";
import assert from "node:assert/strict";
import {
  addRelationship,
  parseFamily,
  removePerson,
  validatePerson,
  relatives,
  generations,
  treeLayout,
  applySeedUpdates,
} from "../src/model.js";

const person = (id) => ({
  id,
  firstName: id,
  lastName: "",
  gender: "",
  birthDate: "",
  deathDate: "",
  status: "NEOVERENÉ",
  source: "",
});
const fixture = () => ({
  version: 1,
  people: ["a", "b", "c", "d"].map(person),
  relationships: [],
  questions: [],
});
const link = (from, to, type = "parent", kind = "unknown") => ({
  id: `${type}-${from}-${to}`,
  from,
  to,
  type,
  kind,
  status: "NEOVERENÉ",
});

test("rejects direct and indirect ancestry cycles without modifying data", () => {
  let family = addRelationship(fixture(), link("a", "b"));
  family = addRelationship(family, link("b", "c"));
  assert.throws(() => addRelationship(family, link("c", "a")), /kruh/);
  assert.throws(() => addRelationship(family, link("b", "a")), /kruh/);
  assert.throws(() => addRelationship(family, link("a", "a")), /sama/);
  assert.equal(family.relationships.length, 2);
});
test("adoptive parents remain explicitly adoptive through export and import", () => {
  let family = addRelationship(fixture(), link("a", "b", "parent", "adoptive"));
  family = addRelationship(family, link("b", "c", "sibling"));
  const restored = parseFamily(JSON.stringify(family));
  assert.equal(relatives(restored, "b").parents[0].relation.kind, "adoptive");
  assert.equal(relatives(restored, "b").siblings[0].person.id, "c");
  assert.equal(relatives(restored, "c").parents.length, 0);
});
test("requires citation for supported claims and relationships", () => {
  assert.throws(
    () => validatePerson({ ...person("a"), status: "PODLOŽENÝ ZÁVER" }),
    /zdroja/,
  );
  assert.throws(
    () =>
      addRelationship(fixture(), {
        ...link("a", "b"),
        status: "DOLOŽENÉ V ZÁZNAME",
      }),
    /zdroja/,
  );
  validatePerson({
    ...person("a"),
    status: "DOLOŽENÉ V ZÁZNAME",
    source: "Testová citácia",
  });
});
test("validates calendar dates, partial years and chronology", () => {
  validatePerson({
    ...person("a"),
    birthDate: "1950",
    deathDate: "1950-02-01",
  });
  validatePerson({ ...person("a"), birthDate: "2000-02-29" });
  assert.throws(
    () => validatePerson({ ...person("a"), birthDate: "1951-02-29" }),
    /Dátum/,
  );
  assert.throws(
    () => validatePerson({ ...person("a"), birthDate: "1951-13-01" }),
    /Dátum/,
  );
  assert.throws(
    () =>
      validatePerson({ ...person("a"), birthDate: "1951", deathDate: "1950" }),
    /Úmrtie/,
  );
});
test("rejects corrupt imports, dangling references, duplicates and cyclic imports", () => {
  assert.throws(() => parseFamily("{"), /JSON/);
  assert.throws(
    () => parseFamily(JSON.stringify({ ...fixture(), version: 2 })),
    /formát/,
  );
  assert.throws(
    () =>
      parseFamily(
        JSON.stringify({ ...fixture(), people: [person("a"), person("a")] }),
      ),
    /ID/,
  );
  assert.throws(
    () =>
      parseFamily(
        JSON.stringify({ ...fixture(), relationships: [link("a", "missing")] }),
      ),
    /existovať/,
  );
  assert.throws(
    () =>
      parseFamily(
        JSON.stringify({
          ...fixture(),
          relationships: [link("a", "b"), link("b", "a")],
        }),
      ),
    /kruh/,
  );
  assert.throws(
    () =>
      parseFamily(
        JSON.stringify({
          ...fixture(),
          relationships: [link("a", "b", "partner"), link("b", "a", "partner")],
        }),
      ),
    /existuje/,
  );
});
test("removing a person cleans up only their relationships", () => {
  let family = addRelationship(fixture(), link("a", "b"));
  family = addRelationship(family, link("c", "d"));
  const next = removePerson(family, "a");
  assert.equal(next.people.length, 3);
  assert.deepEqual(
    next.relationships.map((r) => r.id),
    ["parent-c-d"],
  );
});
test("renders distinct people with identical names and calculates generations", () => {
  let family = fixture();
  family.people[0].firstName = family.people[1].firstName = "Rudolf";
  family = addRelationship(family, link("a", "b"));
  family = addRelationship(family, link("b", "c"));
  assert.equal(generations(family), 3);
  const layout = treeLayout(family, "c");
  assert.equal(layout.nodes.length, 3);
  assert.equal(new Set(layout.nodes.map((n) => n.person.id)).size, 3);
  assert.ok(layout.nodes.every((n) => n.x >= 0 && n.y >= 0));
});

test("research additions preserve edits and deletions and apply only once", () => {
  const seed = { ...fixture(), title: "Test family", seedRevision: 2,
    sources: [{ id: "s1", title: "Archive", url: "https://example.org/" }],
    seedUpdates: [{ revision: 2, people: ["d"], relationships: ["sibling-b-d"], sources: ["s1"] }] };
  seed.relationships = [link("a", "b"), link("b", "c"), link("b", "d", "sibling")];
  let saved = parseFamily(JSON.stringify({ ...seed, seedRevision: 1,
    people: seed.people.filter(p => p.id !== "a" && p.id !== "d"),
    relationships: [link("b", "c")], sources: [] }));
  saved.people[0].firstName = "User edit";
  const original = JSON.stringify(saved);
  const updated = applySeedUpdates(saved, seed);
  assert.equal(JSON.stringify(saved), original);
  assert.equal(updated.people.find(p => p.id === "b").firstName, "User edit");
  assert.equal(updated.people.some(p => p.id === "a"), false);
  assert.equal(updated.people.filter(p => p.id === "d").length, 1);
  assert.equal(updated.relationships.filter(r => r.type === "sibling").length, 1);
  assert.equal(relatives(updated, "d").parents.length, 0);
  assert.equal(updated.sources[0].id, "s1");
  assert.equal(applySeedUpdates(updated, seed), updated);
  const cleared = applySeedUpdates({ ...saved, people: [], relationships: [] }, seed);
  assert.equal(cleared.people.length, 0);
  const unrelated = { ...saved, title: "Another tree" };
  assert.equal(applySeedUpdates(unrelated, seed), unrelated);
});

test("keeps a parent's sister in its own branch without assigning grandparents", () => {
  let family = fixture();
  family.people.find(p => p.id === "d").gender = "female";
  family = addRelationship(family, link("a", "b"));
  family = addRelationship(family, link("b", "c"));
  family = addRelationship(family, link("b", "d", "sibling"));
  const layout = treeLayout(family, "c");
  assert.equal(layout.nodes.find(n => n.person.id === "d").level, -1);
  assert.equal(layout.nodes.find(n => n.person.id === "b").level, -1);
  assert.equal(relatives(family, "d").parents.length, 0);
  assert.equal(layout.edges.some(r => r.from === "a" && r.to === "d"), false);
});

test("record corrections fill unchanged profiles without overwriting user dates", () => {
  const before = parseFamily(JSON.stringify({ ...fixture(), title: "Test family", seedRevision: 2 }));
  const seed = { ...before, seedRevision: 3, people: before.people.map(p =>
    p.id === "a" ? { ...p, birthDate: "1922-08-10", deathDate: "1986-05-30", source: "Headstone", status: "PODLOŽENÝ ZÁVER" } : p),
    seedUpdates: [{ revision: 3, updatePeople: [{ personId: "a",
      ifUnchanged: { birthDate: "", deathDate: "", source: "", status: "NEOVERENÉ" },
      fields: ["birthDate", "deathDate", "source", "status"] }] }] };
  const updated = applySeedUpdates(before, seed);
  assert.equal(updated.people[0].birthDate, "1922-08-10");
  assert.equal(updated.people[0].status, "PODLOŽENÝ ZÁVER");
  const edited = { ...before, people: before.people.map(p => p.id === "a" ? { ...p, birthDate: "1923" } : p) };
  assert.equal(applySeedUpdates(edited, seed).people[0].birthDate, "1923");
  assert.equal(applySeedUpdates(edited, seed).people[0].deathDate, "");
  assert.equal(applySeedUpdates(removePerson(before, "a"), seed).people.some(p => p.id === "a"), false);
});

test("keeps parents together and puts an aunt and her children in the maternal branch", () => {
  let family = { ...fixture(), people: ["mother", "aunt", "father", "focus", "spouse", "cousin", "unrelated"].map(person) };
  family.people.find(p => p.id === "mother").gender = "female";
  family.people.find(p => p.id === "father").gender = "male";
  family.people.find(p => p.id === "aunt").gender = "female";
  family.people.find(p => p.id === "cousin").gender = "female";
  for (const r of [link("mother", "focus"), link("father", "focus"),
    link("mother", "aunt", "sibling"), link("mother", "father", "partner"),
    link("aunt", "spouse", "partner"), link("aunt", "cousin"), link("spouse", "cousin")])
    family = addRelationship(family, r);
  const before = JSON.stringify(family);
  const layout = treeLayout(family, "focus");
  const node = id => layout.nodes.find(n => n.person.id === id);
  assert.equal(node("mother").y, node("father").y);
  assert.equal(Math.abs(node("mother").x - node("father").x), layout.columnStep);
  assert(node("father").x < node("mother").x);
  assert.equal(node("aunt").y, node("mother").y);
  assert.equal(node("spouse").y, node("aunt").y);
  assert.equal(node("cousin").y, node("focus").y);
  assert.equal(node("aunt").side, "maternal");
  assert.equal(node("cousin").side, "maternal");
  assert.equal(node("father").side, "paternal");
  assert.equal(node("spouse").x - node("aunt").x, layout.columnStep);
  assert.deepEqual(layout.parentGroups.find(g => g.children.some(c => c.id === "cousin")).parents.sort(), ["aunt", "spouse"]);
  assert.equal(node("mother").role, "MATKA");
  assert.equal(node("father").role, "OTEC");
  assert.equal(node("unrelated"), undefined);
  assert.equal(new Set(layout.nodes.map(n => n.person.id)).size, layout.nodes.length);
  assert.equal(layout.edges.some(r => r.to === "cousin"), false);
  assert.equal(JSON.stringify(family), before);
  const auntFocus = treeLayout(family, "aunt");
  assert.equal(auntFocus.nodes.find(n => n.person.id === "cousin").role, "DIEŤA");
});

test("preserves marriage through export/import without treating every partner as married", () => {
  const married = addRelationship(fixture(), { ...link("a", "b", "partner"), union: "married" });
  const restored = parseFamily(JSON.stringify(married));
  assert.equal(restored.relationships[0].union, "married");
  assert.equal(treeLayout(restored, "a").nodes.find(n => n.person.id === "b").role, "MANŽEL");
  const partners = parseFamily(JSON.stringify(addRelationship(fixture(), link("a", "b", "partner"))));
  assert.equal(partners.relationships[0].union, "unknown");
  assert.equal(treeLayout(partners, "a").nodes.find(n => n.person.id === "b").role, "PARTNER");
  assert.throws(() => addRelationship(fixture(), { ...link("a", "b"), union: "married" }), /partnerského/);
  const saved = { ...partners, title: "Test family", seedRevision: 4 };
  const seed = { ...restored, title: "Test family", seedRevision: 5,
    seedUpdates: [{ revision: 5, updateUnions: [{ relationshipId: "partner-a-b", ifSource: "" }] }] };
  assert.equal(applySeedUpdates(saved, seed).relationships[0].union, "married");
  const edited = { ...saved, relationships: saved.relationships.map(r => ({ ...r, source: "User correction" })) };
  assert.equal(applySeedUpdates(edited, seed).relationships[0].union, "unknown");
});

test("aligns both family branches by generation and keeps every focus inside the canvas", async () => {
  const { readFile } = await import("node:fs/promises");
  const family = parseFamily(await readFile(new URL("../src/initial-family.json", import.meta.url), "utf8"));
  const layout = treeLayout(family, "P001");
  const node = id => layout.nodes.find(n => n.person.id === id);
  const rows = [
    ["P014"],
    ["P006", "P007", "P008", "P009", "P015", "P016", "P017"],
    ["P002", "P003", "P010", "P011", "P012", "P013", "P018", "P019", "P020", "P021"],
    ["P001", "P004", "P005", "P022", "P023", "P024", "P025", "P028", "P031"],
    ["P026", "P027", "P029", "P030"],
  ];
  for (const row of rows) assert.equal(new Set(row.map(id => node(id).y)).size, 1);
  assert.equal(node("P002").x - node("P003").x, layout.columnStep);
  for (const id of ["P003", "P008", "P009", "P011", "P012", "P013", "P024", "P031"])
    assert(node(id).x + layout.cardWidth < layout.boundary, id);
  for (const id of ["P002", "P006", "P007", "P010", "P014", "P022", "P023", "P026", "P027", "P029", "P030"])
    assert(node(id).x > layout.boundary, id);
  for (const r of family.relationships.filter(r => r.type === "partner"))
    assert.equal(Math.abs(node(r.from).x - node(r.to).x), layout.columnStep, r.id);
  const parentsOf = id => layout.parentGroups.find(g => g.children.some(c => c.id === id)).parents.sort();
  assert.deepEqual(parentsOf("P026"), ["P022"]); // A spouse is not automatically a parent.
  assert.deepEqual(parentsOf("P031"), ["P013", "P021"]);
  assert.deepEqual(parentsOf("P024"), ["P011", "P019"]);
  assert.equal(node("P024").x, (node("P011").x + node("P019").x) / 2);
  assert.deepEqual(parentsOf("P004"), ["P002", "P003"]);
  // Expected from the user's family statements and the cited 1930 census.
  const recordedParents = {
    P001: ["P002", "P003"], P002: ["P006", "P007"], P003: ["P008", "P009"],
    P004: ["P002", "P003"], P005: ["P002", "P003"], P007: ["P014"],
    P010: ["P006", "P007"], P011: ["P008", "P009"], P012: ["P008", "P009"], P013: ["P008", "P009"],
    P015: ["P014"], P016: ["P014"], P017: ["P014"],
    P022: ["P010", "P018"], P023: ["P010", "P018"], P024: ["P011", "P019"],
    P026: ["P022"], P027: ["P022"], P029: ["P023", "P028"], P030: ["P023", "P028"], P031: ["P013", "P021"],
  };
  for (const person of family.people)
    assert.deepEqual(relatives(family, person.id).parents.map(r => r.person.id).sort(), recordedParents[person.id] || [], person.id);
  assert.equal(family.relationships.filter(r => r.type === "parent" && r.kind === "adoptive").length, 4);

  for (const person of family.people) {
    const view = treeLayout(family, person.id);
    for (const n of view.nodes) {
      assert(Number.isFinite(n.x) && Number.isFinite(n.y), `${person.id}: ${n.person.id}`);
      assert(n.x >= 0 && n.x + view.cardWidth <= view.width, `${person.id}: ${n.person.id} outside canvas`);
    }
    for (const level of view.levels) {
      const row = view.nodes.filter(n => n.level === level).sort((a,b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) assert(row[i].x >= row[i-1].x + view.cardWidth, `${person.id}: overlapping cards`);
    }
  }
});

test("corrects Pavel's saved parent pair atomically and applies confirmed surnames without losing edits", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(new URL("../src/initial-family.json", import.meta.url), "utf8"));
  const correction = raw.seedUpdates.find(u => u.revision === 6);
  const old = parseFamily(JSON.stringify(raw));
  old.seedRevision = 5;
  for (const before of correction.updateParentage[0].ifUnchanged)
    Object.assign(old.relationships.find(r => r.id === before.id), before);
  for (const change of correction.updatePeople)
    Object.assign(old.people.find(p => p.id === change.personId), change.ifUnchanged);
  for (const change of correction.updateQuestions)
    Object.assign(old.questions.find(q => q.id === change.questionId), change.ifUnchanged);
  old.sources = old.sources.filter(s => !correction.sources.includes(s.id));
  const untouched = JSON.stringify(old);
  const migrated = applySeedUpdates(old, raw);
  assert.deepEqual(relatives(migrated, "P024").parents.map(r => r.person.id).sort(), ["P011", "P019"]);
  assert.deepEqual(relatives(migrated, "P010").children.map(r => r.person.id).sort(), ["P022", "P023"]);
  assert.equal(migrated.people.filter(p => p.id === "P024").length, 1);
  assert.equal(migrated.people.length, 31);
  assert.equal(migrated.relationships.length, 51);
  for (const id of ["P004", "P005", "P026", "P027", "P029", "P030"])
    assert.equal(migrated.people.find(p => p.id === id).lastName, raw.people.find(p => p.id === id).lastName);
  assert(migrated.questions.find(q => q.id === "Q011").detail.includes("syn Pavel P024"));
  assert.equal(JSON.stringify(old), untouched);
  assert.equal(applySeedUpdates(migrated, raw), migrated);

  const edited = structuredClone(old);
  edited.people.find(p => p.id === "P026").lastName = "Vlastná úprava";
  edited.people.find(p => p.id === "P001").note = "Moje poznámky";
  edited.relationships.find(r => r.id === "L040").source = "Vlastný doklad";
  const preserved = applySeedUpdates(edited, raw);
  assert.deepEqual(relatives(preserved, "P024").parents.map(r => r.person.id).sort(), ["P010", "P018"]);
  assert.equal(preserved.people.find(p => p.id === "P026").lastName, "Vlastná úprava");
  assert.equal(preserved.people.find(p => p.id === "P001").note, "Moje poznámky");
  const missingLink = { ...old, relationships: old.relationships.filter(r => r.id !== "L041") };
  assert.deepEqual(relatives(applySeedUpdates(missingLink, raw), "P024").parents.map(r => r.person.id), ["P010"]);
  assert.equal(applySeedUpdates(removePerson(old, "P024"), raw).people.some(p => p.id === "P024"), false);
  const extra = addRelationship(old, link("P014", "P024"));
  assert.equal(relatives(applySeedUpdates(extra, raw), "P024").parents.length, 3);
  const cyclic = addRelationship(old, link("P024", "P011"));
  assert.deepEqual(relatives(applySeedUpdates(cyclic, raw), "P024").parents.map(r => r.person.id).sort(), ["P010", "P018"]);
});
