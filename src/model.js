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
  const union = relation.union || "unknown";
  if (!["unknown", "married"].includes(union) || (type !== "partner" && union !== "unknown"))
    throw new Error("Neplatný druh partnerského vzťahu.");
  return {
    ...family,
    relationships: [
      ...family.relationships,
      { ...relation, kind, union, status, source: relation.source || "" },
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
    seedRevision:
      Number.isSafeInteger(data.seedRevision) && data.seedRevision > 0
        ? data.seedRevision
        : 0,
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
      union: r.union,
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

// Apply explicit additions from a newer research release while preserving edits
// and deliberate deletions of people from earlier releases.
export function applySeedUpdates(family, rawSeed) {
  const seed = parseFamily(JSON.stringify(rawSeed));
  if (!family.seedRevision || family.seedRevision >= seed.seedRevision || family.title !== seed.title) return family;
  if (!family.people.length) return { ...family, seedRevision: seed.seedRevision };
  let next = { ...family, people: [...family.people], relationships: [...family.relationships], questions: [...family.questions], sources: [...family.sources] };
  for (const update of (rawSeed.seedUpdates || []).filter(u => u.revision > family.seedRevision && u.revision <= seed.seedRevision).sort((a,b) => a.revision - b.revision)) {
    for (const id of update.people || []) {
      const person = seed.people.find(p => p.id === id);
      if (person && !next.people.some(p => p.id === id)) next.people.push(person);
    }
    for (const id of update.relationships || []) {
      const relation = seed.relationships.find(r => r.id === id);
      if (!relation || ![relation.from, relation.to].every(key => next.people.some(p => p.id === key))) continue;
      if (next.relationships.some(r => r.id === relation.id || (r.type === relation.type && ((r.from === relation.from && r.to === relation.to) || (r.type !== 'parent' && r.from === relation.to && r.to === relation.from))))) continue;
      next = addRelationship(next, relation);
    }
    for (const id of update.questions || []) if (!next.questions.some(q => q.id === id)) {
      const question = seed.questions.find(q => q.id === id);
      if (question) next.questions.push(question);
    }
    for (const id of update.sources || []) if (!next.sources.some(s => s.id === id)) {
      const source = seed.sources.find(s => s.id === id);
      if (source) next.sources.push(source);
    }
    for (const item of update.updateUnions || []) {
      const recorded = seed.relationships.find(r => r.id === item.relationshipId && r.type === "partner");
      if (recorded) next.relationships = next.relationships.map(r =>
        r.id === recorded.id && r.type === "partner" && r.union === "unknown" && r.source === item.ifSource
          ? { ...r, union: recorded.union } : r);
    }
    for (const item of update.updatePeople || []) {
      const person = seed.people.find(p => p.id === item.personId);
      if (!person) continue;
      next.people = next.people.map(p => p.id === item.personId &&
        Object.entries(item.ifUnchanged || {}).every(([key, value]) => p[key] === value)
        ? { ...p, ...Object.fromEntries((item.fields || []).map(key => [key, person[key]])) }
        : p);
    }
    for (const item of update.appendNotes || []) next.people = next.people.map(p => p.id === item.personId && !p.note.includes(item.text) ? { ...p, note: [p.note,item.text].filter(Boolean).join('\n') } : p);
  }
  return { ...next, seedRevision: seed.seedRevision };
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
  const cardWidth = 128, cardHeight = 98, columnStep = 144, rowStep = 148, padding = 32;
  if (!family.people.length) return { nodes: [], edges: [], parentGroups: [], width: 840, height: 440, cardWidth, cardHeight, columnStep };
  const focus = family.people.find(p => p.id === focusId) || family.people[0];
  const orderedParents = id => relatives(family, id).parents.slice().sort((a,b) =>
    ({ male: 0, female: 1 }[a.person.gender] ?? 2) - ({ male: 0, female: 1 }[b.person.gender] ?? 2));
  const depths = new Map([[focus.id, 0]]), sides = new Map([[focus.id, "shared"]]), ancestors = new Set();
  let frontier = [focus.id];
  for (let depth = 1; depth <= 3; depth++) {
    const next = [];
    for (const id of frontier) for (const { person } of orderedParents(id)) if (!depths.has(person.id)) {
      depths.set(person.id, -depth);
      sides.set(person.id, depth === 1 ? person.gender === "female" ? "maternal" : "paternal" : sides.get(id));
      ancestors.add(person.id); next.push(person.id);
    }
    frontier = next;
  }
  const rels = relatives(family, focus.id);
  for (const { person } of [...rels.siblings, ...rels.partners]) if (!depths.has(person.id)) {
    depths.set(person.id, 0); sides.set(person.id, "shared");
  }
  for (const id of ancestors) for (const { person } of relatives(family, id).siblings) if (!depths.has(person.id)) {
    depths.set(person.id, depths.get(id)); sides.set(person.id, sides.get(id));
  }
  let familyFrontier = [...depths];
  for (let generation = 0; generation < 2; generation++) {
    const next = [];
    for (const [id, level] of familyFrontier) for (const { person } of relatives(family, id).children) if (level < 2 && !depths.has(person.id)) {
      depths.set(person.id, level + 1); sides.set(person.id, sides.get(id)); next.push([person.id, level + 1]);
    }
    familyFrontier = next;
  }
  const partnerIds = new Set(rels.partners.map(r => r.person.id));
  for (const [id, level] of [...depths]) for (const { person } of relatives(family, id).partners) if (!depths.has(person.id)) {
    depths.set(person.id, level); sides.set(person.id, sides.get(id)); partnerIds.add(person.id);
  }
  const levels = [...new Set(depths.values())].sort((a,b) => a-b);
  const idsAt = (level, side) => [...depths].filter(([id, d]) => d === level && sides.get(id) === side).map(([id]) => id);
  const sharedCount = idsAt(0, "shared").length;
  const sharedGap = (sharedCount + 1) / 2;
  const reserve = Math.ceil(sharedGap);
  const paternalColumns = Math.max(3, ...levels.map(l => idsAt(l, "paternal").length + (l === 0 ? reserve : 0)));
  const maternalColumns = Math.max(3, ...levels.map(l => idsAt(l, "maternal").length + (l === 0 ? reserve : 0)));
  let boundary = padding + paternalColumns * columnStep;
  let width = padding * 2 + (paternalColumns + maternalColumns) * columnStep;
  const height = Math.max(390, levels.length * rowStep + 68);
  const positions = new Map();
  const pairBlocks = ids => {
    const seen = new Set(), blocks = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const linked = relatives(family, id);
      const coParents = linked.children.flatMap(r => orderedParents(r.person.id).map(p => p.person.id));
      const buddy = [...linked.partners.map(r => r.person.id), ...coParents].find(key => key !== id && ids.includes(key) && !seen.has(key));
      const block = [id]; if (buddy) { seen.add(buddy); block.push(buddy); }
      blocks.push(block);
    }
    return blocks;
  };
  const put = (id, centre, level) => positions.set(id, { x: centre - cardWidth / 2, y: levels.indexOf(level) * rowStep + 42 });
  const rootParentIds = orderedParents(focus.id).map(r => r.person.id);
  // Reserve the central joining point for the focus family. All side families
  // remain inside the fixed paternal/maternal lanes, on the same generation row.
  for (const level of [-1, -2, -3, 0, 1, 2]) {
    if (!levels.includes(level)) continue;
    if (level === 0) {
      const partners = rels.partners.map(r => r.person.id).filter(id => depths.get(id) === 0);
      const siblings = rels.siblings.map(r => r.person.id).filter(id => depths.get(id) === 0 && !partners.includes(id));
      const ordered = [...siblings.slice(0,1), focus.id, ...partners, ...siblings.slice(1)];
      const common = pairBlocks([...ordered, ...idsAt(0, "shared").filter(id => !ordered.includes(id))]).flat();
      common.forEach((id,i) => put(id, boundary + (i - (common.length - 1) / 2) * columnStep, level));
    }
    for (const side of ["paternal", "maternal", "shared"]) {
      if (level === 0 && side === "shared") continue;
      const blocks = pairBlocks(idsAt(level, side));
      if (level === -1) blocks.sort((a,b) => side === "paternal"
        ? Number(a.some(id => rootParentIds.includes(id))) - Number(b.some(id => rootParentIds.includes(id)))
        : Number(b.some(id => rootParentIds.includes(id))) - Number(a.some(id => rootParentIds.includes(id))));
      let ids = blocks.flat();
      let start = side === "paternal" ? boundary - ids.length * columnStep : side === "maternal" ? boundary : boundary - ids.length * columnStep / 2;
      if (level === 0) start = side === "paternal" ? boundary - (sharedGap + ids.length) * columnStep : boundary + sharedGap * columnStep - columnStep / 2;
      if (level > 0) {
        // Each child group sits under its own recorded parents. No inferred
        // paternity from a spouse, and no bus shared by unrelated households.
        const groups = new Map();
        for (const block of blocks) {
          const parents = block.map(id => orderedParents(id).filter(r => positions.has(r.person.id))).find(p => p.length) || [];
          const key = parents.map(r => r.person.id).sort().join("|") || block[0];
          if (!groups.has(key)) groups.set(key, { ids: [], parents });
          groups.get(key).ids.push(...block);
        }
        const ordered = [...groups.values()].map(g => ({ ...g, target: g.parents.length
          ? g.parents.reduce((sum,r) => sum + positions.get(r.person.id).x + cardWidth / 2, 0) / g.parents.length
          : start + columnStep / 2 })).sort((a,b) => a.target - b.target);
        let end = side === "paternal" ? padding : side === "maternal" ? boundary : padding;
        for (const group of ordered) {
          const left = Math.max(end, group.target - (group.ids.length - 1) * columnStep / 2);
          group.ids.forEach((id,i) => put(id, left + i * columnStep, level));
          end = left + group.ids.length * columnStep;
        }
      } else {
        if (level === 0 && side === "paternal" && ids.length === 1) {
          const parents = orderedParents(ids[0]).filter(r => positions.has(r.person.id));
          if (parents.length) start = parents.reduce((sum,r) => sum + positions.get(r.person.id).x + cardWidth / 2, 0) / parents.length - columnStep / 2;
        }
        if (level === -3 && ids.length === 1) {
          const children = relatives(family, ids[0]).children.filter(r => positions.has(r.person.id));
          if (children.length) start = positions.get(children[0].person.id).x + cardWidth / 2 - columnStep / 2;
        }
        ids.forEach((id,i) => put(id, start + (i + .5) * columnStep, level));
      }
    }
  }
  // A focus change may reveal a wider household. Keep all cards inside the
  // canvas without clipping or changing any recorded family relationships.
  const shift = Math.max(0, padding - Math.min(...[...positions.values()].map(n => n.x)));
  if (shift) { for (const n of positions.values()) n.x += shift; boundary += shift; }
  width = Math.max(width + shift, ...[...positions.values()].map(n => n.x + cardWidth + padding));
  const parentGroups = new Map();
  for (const [childId] of depths) {
    const parents = relatives(family, childId).parents.filter(r => depths.has(r.person.id));
    if (!parents.length) continue;
    const key = parents.map(r => r.person.id).sort().join("|") + ":" + depths.get(childId);
    if (!parentGroups.has(key)) parentGroups.set(key, { id: key, parents: parents.map(r => r.person.id), children: [] });
    parentGroups.get(key).children.push({ id: childId, relations: parents.map(r => r.relation) });
  }
  const nodes = [...depths].map(([id, level]) => {
    const person = family.people.find(p => p.id === id);
    let role = "RODINA";
    if (id === focus.id) role = "VÝCHODISKO";
    else if (ancestors.has(id)) role = level === -1 ? person.gender === "female" ? "MATKA" : person.gender === "male" ? "OTEC" : "RODIČ" : level === -3 ? "PRASTARÝ RODIČ" : "STARÝ RODIČ";
    else if (partnerIds.has(id)) {
      const married = family.relationships.some(r => r.type === "partner" && r.union === "married" && (r.from === id || r.to === id));
      role = married ? person.gender === "female" ? "MANŽELKA" : "MANŽEL" : person.gender === "female" ? "PARTNERKA" : "PARTNER";
    } else if (rels.siblings.some(r => r.person.id === id)) role = "SÚRODENEC";
    else if (level === -1) role = person.gender === "female" ? "TETA" : "STRÝKO";
    else if (level === -2) role = person.gender === "female" ? "PRATETA" : "PRASTRÝKO";
    else if (level === 0) role = person.gender === "female" ? "SESTERNICA" : "BRATRANEC";
    else if (rels.children.some(r => r.person.id === id)) role = "DIEŤA";
    return { person, ...positions.get(id), level, role, side: sides.get(id) };
  });
  const edges = family.relationships.filter(r => {
    if (!depths.has(r.from) || !depths.has(r.to)) return false;
    if (r.type === "partner") return true;
    if (r.type !== "sibling") return false;
    const parents = relatives(family, r.from).parents.map(p => p.person.id);
    return !relatives(family, r.to).parents.some(p => parents.includes(p.person.id));
  });
  return { nodes, edges,
    parentGroups: [...parentGroups.values()], levels, boundary, width, height, cardWidth, cardHeight, columnStep };
}
