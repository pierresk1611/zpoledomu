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
