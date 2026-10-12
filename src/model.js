export const STORAGE_KEY = "zpoledomu.family.v1";
export const STATUSES = [
  "NEOVERENÉ",
  "DOLOŽENÉ V ZÁZNAME",
  "PODLOŽENÝ ZÁVER",
  "HYPOTÉZA",
  "ROZPOR",
];
export const STATUS_LABELS = {
  NEOVERENÉ: "Neoverené",
  "DOLOŽENÉ V ZÁZNAME": "Doložené v zázname",
  "PODLOŽENÝ ZÁVER": "Podložený záver",
  HYPOTÉZA: "Hypotéza",
  ROZPOR: "Rozpor",
};
export const emptyFamily = () => ({
  version: 1,
  title: "Ďurišovci",
  people: [],
  relationships: [],
  questions: [],
  sources: [],
});
export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const fullName = (person) =>
  [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Bez mena";
export const initials = (person) =>
  `${person?.firstName?.[0] || ""}${person?.lastName?.[0] || ""}`.toUpperCase() ||
  "?";
export const year = (date) => date?.slice(0, 4) || "";
export const lifeDates = (p) =>
  !p.birthDate && !p.deathDate
    ? "Dátumy neznáme"
    : `${p.birthDate ? year(p.birthDate) : "?"}${p.deathDate ? ` — ${year(p.deathDate)}` : ""}`;
export const displayDate = (date) =>
  date?.length === 10
    ? `${Number(date.slice(8))}. ${Number(date.slice(5, 7))}. ${date.slice(0, 4)}`
    : date || "Neuvedené";
export const isSupported = (status) =>
  ["DOLOŽENÉ V ZÁZNAME", "PODLOŽENÝ ZÁVER"].includes(status);

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}(-\d{2}-\d{2})?$/.test(value) || Number(value.slice(0, 4)) < 1)
    return false;
  if (value.length === 4) return true;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function validatePerson(p) {
  if (!p.firstName?.trim() && !p.lastName?.trim())
    throw new Error("Vyplňte aspoň meno alebo priezvisko.");
  for (const field of ["birthDate", "deathDate"])
    if (!validDate(p[field]))
      throw new Error(
        "Dátum zadajte ako rok (1950) alebo platný dátum (1950-06-12).",
      );
  if (p.birthDate && p.deathDate) {
    const birth =
      p.birthDate.length === 4 ? `${p.birthDate}-01-01` : p.birthDate;
    const death =
      p.deathDate.length === 4 ? `${p.deathDate}-12-31` : p.deathDate;
    if (death < birth) throw new Error("Úmrtie nemôže predchádzať narodeniu.");
  }
  if (isSupported(p.status) && !p.source?.trim())
    throw new Error("K doloženým údajom pridajte citáciu alebo opis zdroja.");
}
export function addRelationship(family, relation) {
  const { type, from, to } = relation;
  if (!["parent", "partner", "sibling"].includes(type))
    throw new Error("Neznámy typ vzťahu.");
  if (from === to) throw new Error("Osoba nemôže byť vo vzťahu sama so sebou.");
  if (![from, to].every((id) => family.people.some((p) => p.id === id)))
    throw new Error("Obe osoby musia existovať v rodokmeni.");
  if (
    family.relationships.some(
      (r) =>
        r.type === type &&
        ((r.from === from && r.to === to) ||
          (type !== "parent" && r.from === to && r.to === from)),
    )
  )
    throw new Error("Tento vzťah už existuje.");
  if (type === "parent") {
    const queue = [to],
      visited = new Set();
    while (queue.length) {
      const id = queue.pop();
      if (id === from)
        throw new Error(
          "Vzťah by vytvoril kruh: osoba by bola vlastným predkom.",
        );
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(
        ...family.relationships
          .filter((r) => r.type === "parent" && r.from === id)
          .map((r) => r.to),
      );
    }
  }
  const status = relation.status || "NEOVERENÉ";
  if (!STATUSES.includes(status)) throw new Error("Neplatný stav dôkazu.");
  const kind = relation.kind || "unknown";
  if (!["unknown", "biological", "adoptive"].includes(kind))
    throw new Error("Neplatný druh rodinnej väzby.");
  if (isSupported(status) && !relation.source?.trim())
    throw new Error("K doloženému vzťahu pridajte citáciu alebo opis zdroja.");
  return {
    ...family,
    relationships: [
      ...family.relationships,
      { ...relation, kind, status, source: relation.source || "" },
    ],
  };
}
export const removePerson = (family, id) => ({
  ...family,
  people: family.people.filter((p) => p.id !== id),
  relationships: family.relationships.filter(
    (r) => r.from !== id && r.to !== id,
  ),
});
export function parseFamily(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Súbor nie je platná JSON záloha.");
  }
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.people) ||
    !Array.isArray(data.relationships)
  )
    throw new Error("Nepodporovaný formát zálohy.");
  if (data.people.length > 10000 || data.relationships.length > 30000)
    throw new Error("Záloha prekračuje podporovaný rozsah.");
  const ids = new Set();
  const people = data.people.map((p) => {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id))
      throw new Error("Neplatné alebo opakované ID osoby.");
    ids.add(p.id);
    const clean = { id: p.id };
    for (const f of [
      "firstName",
      "lastName",
      "birthName",
      "gender",
      "birthDate",
      "deathDate",
      "birthPlace",
      "note",
      "source",
      "status",
    ]) {
      if (p[f] != null && typeof p[f] !== "string")
        throw new Error("Neplatné údaje osoby.");
      clean[f] = p[f] || "";
      if (clean[f].length > 50000)
        throw new Error("Text v zálohe je príliš dlhý.");
    }
    clean.status ||= "NEOVERENÉ";
    if (
      !STATUSES.includes(clean.status) ||
      !["", "female", "male", "other"].includes(clean.gender)
    )
      throw new Error("Neplatný stav alebo pohlavie osoby.");
    validatePerson(clean);
    return clean;
  });
  let family = {
    version: 1,
    title:
      typeof data.title === "string"
        ? data.title === "Rodina Ďurišových"
          ? "Ďurišovci"
          : data.title.slice(0, 200)
        : "Ďurišovci",
    people,
    relationships: [],
    questions: [],
    sources: [],
  };
  const relationIds = new Set();
  for (const r of data.relationships) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      relationIds.has(r.id) ||
      typeof r.from !== "string" ||
      typeof r.to !== "string" ||
      (r.source != null && typeof r.source !== "string")
    )
      throw new Error("Neplatný vzťah v zálohe.");
    relationIds.add(r.id);
    family = addRelationship(family, {
      id: r.id,
      type: r.type,
      from: r.from,
      to: r.to,
      kind: r.kind,
      source: r.source || "",
      status: r.status || "NEOVERENÉ",
    });
  }
  if (Array.isArray(data.questions))
    family.questions = data.questions.slice(0, 100).map((q) => ({
      id: String(q.id || ""),
      title: String(q.title || ""),
      detail: String(q.detail || ""),
      status: String(q.status || "Otvorené"),
    }));
  if (Array.isArray(data.sources)) {
    family.sources = data.sources.slice(0, 100).map((s) => {
      if (!s || typeof s.url !== "string" || !/^https?:\/\//i.test(s.url))
        throw new Error("Neplatný odkaz na zdroj v zálohe.");
      return {
        id: String(s.id || ""),
        title: String(s.title || ""),
        url: s.url,
        note: String(s.note || ""),
        checked: String(s.checked || ""),
      };
    });
  }
  return family;
}
export function relatives(family, id) {
  const lookup = (key) => family.people.find((p) => p.id === key);
  const both = (type) =>
    family.relationships
      .filter((r) => r.type === type && (r.from === id || r.to === id))
      .map((r) => ({
        person: lookup(r.from === id ? r.to : r.from),
        relation: r,
      }));
  const parents = family.relationships
    .filter((r) => r.type === "parent" && r.to === id)
    .map((r) => ({ person: lookup(r.from), relation: r }));
  const children = family.relationships
    .filter((r) => r.type === "parent" && r.from === id)
    .map((r) => ({ person: lookup(r.to), relation: r }));
  const siblings = both("sibling");
  for (const { person: parent } of parents)
    for (const child of family.relationships.filter(
      (r) => r.type === "parent" && r.from === parent.id && r.to !== id,
    )) {
      if (!siblings.some((s) => s.person.id === child.to))
        siblings.push({
          person: lookup(child.to),
          relation: child,
          inferred: true,
        });
    }
  return { parents, children, partners: both("partner"), siblings };
}
export function generations(family) {
  const memo = new Map();
  function depth(id) {
    if (memo.has(id)) return memo.get(id);
    const parents = family.relationships.filter(
      (r) => r.type === "parent" && r.to === id,
    );
    const d = 1 + Math.max(0, ...parents.map((r) => depth(r.from)));
    memo.set(id, d);
    return d;
  }
  return Math.max(0, ...family.people.map((p) => depth(p.id)));
}
export function treeLayout(family, focusId) {
  if (!family.people.length)
    return { nodes: [], edges: [], width: 840, height: 440 };
  const focus = family.people.find((p) => p.id === focusId) || family.people[0];
  const depths = new Map([[focus.id, 0]]);
  let current = [focus.id];
  for (let depth = 1; depth <= 3; depth++) {
    const next = [];
    for (const id of current)
      for (const { person } of relatives(family, id).parents)
        if (!depths.has(person.id)) {
          depths.set(person.id, -depth);
          next.push(person.id);
        }
    current = next;
  }
  const { children, partners, siblings } = relatives(family, focus.id);
  for (const { person } of [...partners, ...siblings])
    if (!depths.has(person.id)) depths.set(person.id, 0);
  for (const { person } of children)
    if (!depths.has(person.id)) depths.set(person.id, 1);
  const levels = [...new Set(depths.values())].sort((a, b) => a - b);
  const width = Math.max(
    840,
    ...levels.map(
      (l) => [...depths.values()].filter((d) => d === l).length * 202 + 70,
    ),
  );
  const height = Math.max(390, levels.length * 165 + 70);
  const nodes = levels.flatMap((l, row) => {
    const ids = [...depths].filter(([, d]) => d === l).map(([id]) => id);
    return ids.map((id, i) => ({
      person: family.people.find((p) => p.id === id),
      x: width / 2 + (i - (ids.length - 1) / 2) * 202 - 87,
      y: row * 165 + 36,
      level: l,
    }));
  });
  return {
    nodes,
    edges: family.relationships.filter(
      (r) => depths.has(r.from) && depths.has(r.to),
    ),
    width,
    height,
  };
}
