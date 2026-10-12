import React, { useEffect, useMemo, useRef, useState } from "react";
import initialFamily from "./initial-family.json";
import {
  Sprout,
  Network,
  Users,
  BookOpen,
  Plus,
  Download,
  Upload,
  Search,
  ChevronRight,
  ChevronDown,
  X,
  MapPin,
  CalendarDays,
  Pencil,
  Trash2,
  Link2,
  ShieldCheck,
  ArrowUpRight,
  Minus,
  Maximize,
  Check,
  Info,
  Heart,
  FileText,
  CircleHelp,
  Menu,
} from "lucide-react";
import {
  STORAGE_KEY,
  STATUSES,
  STATUS_LABELS,
  emptyFamily,
  newId,
  fullName,
  initials,
  lifeDates,
  displayDate,
  isSupported,
  validatePerson,
  parseFamily,
  addRelationship,
  removePerson,
  relatives,
  generations,
  treeLayout,
  applySeedUpdates,
} from "./model.js";

const blankPerson = {
  firstName: "",
  lastName: "",
  birthName: "",
  gender: "",
  birthDate: "",
  deathDate: "",
  birthPlace: "",
  source: "",
  status: "NEOVERENÉ",
  note: "",
};
const kindLabel = (kind) =>
  kind === "adoptive"
    ? "Adoptívna väzba"
    : kind === "biological"
      ? "Biologická väzba"
      : "Rodinná väzba";

function Status({ value }) {
  return (
    <span
      className={`status ${isSupported(value) ? "supported" : value === "ROZPOR" ? "conflict" : ""}`}
    >
      <i />
      {STATUS_LABELS[value] || value}
    </span>
  );
}
function Avatar({ person, large = false }) {
  return (
    <span
      className={`avatar ${person.gender === "female" ? "rose" : person.gender === "male" ? "sage" : "sand"} ${large ? "large" : ""}`}
    >
      {initials(person)}
    </span>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const onCancel = (e) => {
      e.preventDefault();
      close.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Zavrieť">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function PersonForm({ initial, onSave, onClose }) {
  const [values, setValues] = useState({ ...blankPerson, ...initial }),
    [error, setError] = useState("");
  const field = (key, label, placeholder = "") => (
    <label>
      {label}
      <input
        value={values[key]}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
        placeholder={placeholder}
        maxLength={key === "note" || key === "source" ? 50000 : 300}
      />
    </label>
  );
  const save = (e) => {
    e.preventDefault();
    const clean = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        typeof v === "string" ? v.trim() : v,
      ]),
    );
    try {
      validatePerson(clean);
      onSave({ ...clean, id: initial?.id || newId() });
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal
      title={initial?.id ? "Upraviť osobu" : "Pridať do rodokmeňa"}
      onClose={onClose}
      wide
    >
      <form onSubmit={save} className="person-form">
        <p className="form-intro">
          Stačí to, čo viete. Neznáme údaje pokojne nechajte prázdne.
        </p>
        <div className="form-grid">
          {field("firstName", "Meno", "napr. Anna")}
          {field("lastName", "Priezvisko", "napr. Nováková")}
          {field("birthName", "Rodné priezvisko", "Ak je známe")}
          <label>
            Pohlavie
            <select
              value={values.gender}
              onChange={(e) => setValues({ ...values, gender: e.target.value })}
            >
              <option value="">Neuvedené</option>
              <option value="female">Žena</option>
              <option value="male">Muž</option>
              <option value="other">Iné</option>
            </select>
          </label>
          {field("birthDate", "Narodenie", "1950 alebo 1950-06-12")}
          {field("deathDate", "Úmrtie", "Nechajte prázdne, ak nie je známe")}
        </div>
        {field(
          "birthPlace",
          "Miesto narodenia",
          "Iba známe rodisko; neistoty patria do poznámky",
        )}
        <label>
          Stav údajov
          <select
            value={values.status}
            onChange={(e) => setValues({ ...values, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zdroj alebo citácia
          <textarea
            rows={2}
            value={values.source}
            onChange={(e) => setValues({ ...values, source: e.target.value })}
            placeholder="Rodinné rozprávanie, doklad alebo archív, kniha, strana, odkaz…"
          />
        </label>
        <label>
          Poznámky a neistoty
          <textarea
            rows={3}
            value={values.note}
            onChange={(e) => setValues({ ...values, note: e.target.value })}
            placeholder="Príbeh, varianty mena, nejasný dátum alebo miesto…"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Zrušiť
          </button>
          <button className="button primary" type="submit" onClick={save}>
            <Check size={16} />
            Uložiť osobu
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RelationshipForm({ family, person, onSave, onClose }) {
  const [values, setValues] = useState({
      other: "",
      role: "parent",
      kind: "unknown",
      status: "NEOVERENÉ",
      source: "",
    }),
    [error, setError] = useState("");
  const save = (e) => {
    e.preventDefault();
    if (!values.other) {
      setError("Vyberte druhú osobu.");
      return;
    }
    const relation = {
      id: newId(),
      type: ["parent", "child"].includes(values.role) ? "parent" : values.role,
      from: values.role === "parent" ? values.other : person.id,
      to: values.role === "parent" ? person.id : values.other,
      kind: values.kind,
      status: values.status,
      source: values.source.trim(),
    };
    try {
      onSave(addRelationship(family, relation));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="Pridať rodinnú väzbu" onClose={onClose}>
      <form onSubmit={save} className="person-form">
        <p className="form-intro">
          Ako súvisí vybraná osoba s osobou <strong>{fullName(person)}</strong>?
        </p>
        <label>
          Osoba
          <select
            aria-label="Osoba"
            value={values.other}
            onChange={(e) => setValues({ ...values, other: e.target.value })}
            required
          >
            <option value="">Vyberte osobu</option>
            {family.people
              .filter((p) => p.id !== person.id)
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {fullName(p)} · {lifeDates(p)} · {p.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Je jej
            <select
              value={values.role}
              onChange={(e) => setValues({ ...values, role: e.target.value })}
            >
              <option value="parent">Rodič</option>
              <option value="child">Dieťa</option>
              <option value="partner">Partner / partnerka</option>
              <option value="sibling">Súrodenec</option>
            </select>
          </label>
          <label>
            Druh väzby
            <select
              value={values.kind}
              onChange={(e) => setValues({ ...values, kind: e.target.value })}
            >
              <option value="unknown">Neuvedené</option>
              <option value="biological">Biologická</option>
              <option value="adoptive">Adoptívna</option>
            </select>
          </label>
        </div>
        <label>
          Stav dôkazu
          <select
            value={values.status}
            onChange={(e) => setValues({ ...values, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option value={s} key={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zdroj vzťahu
          <textarea
            rows={3}
            value={values.source}
            onChange={(e) => setValues({ ...values, source: e.target.value })}
            placeholder="Ktorý záznam alebo rodinný údaj dokladá túto väzbu?"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Zrušiť
          </button>
          <button className="button primary" type="submit" onClick={save}>
            Uložiť väzbu
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Tree({ family, focusId, selectedId, onSelect, zoom, onAdd }) {
  const layout = useMemo(() => treeLayout(family, focusId), [family, focusId]);
  if (!family.people.length)
    return (
      <div className="empty-tree">
        <div className="empty-emblem">
          <Sprout size={44} strokeWidth={1.3} />
        </div>
        <span className="eyebrow">PRVÝ KROK K VAŠIM KOREŇOM</span>
        <h2>Váš príbeh sa začína vami.</h2>
        <p>
          Pridajte prvú osobu a postupne objavujte
          <br />
          ľudí, ktorí sú súčasťou vašej rodiny.
        </p>
        <button className="button primary" onClick={onAdd}>
          <Plus size={17} />
          Pridať prvú osobu
        </button>
      </div>
    );
  const positions = new Map(layout.nodes.map((n) => [n.person.id, n]));
  return (
    <div className="tree-scroll">
      <div
        style={{ width: layout.width * zoom, height: layout.height * zoom }}
        className="tree-sized"
      >
        <div
          className="tree-canvas"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${zoom})`,
          }}
        >
          <svg
            className="connectors"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {layout.edges.map((r) => {
              const a = positions.get(r.from),
                b = positions.get(r.to);
              let path;
              if (r.type === "parent") {
                const x1 = a.x + 87,
                  x2 = b.x + 87,
                  y1 = a.y + 108,
                  y2 = b.y,
                  mid = (y1 + y2) / 2;
                path = `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`;
              } else if (r.type === "sibling") {
                const y = Math.min(a.y, b.y) - 16;
                path = `M ${a.x + 87} ${a.y} V ${y} H ${b.x + 87} V ${b.y}`;
              } else {
                const left = a.x < b.x ? a : b,
                  right = a.x < b.x ? b : a;
                path = `M ${left.x + 174} ${left.y + 54} H ${right.x}`;
              }
              return (
                <path
                  key={r.id}
                  d={path}
                  className={`${isSupported(r.status) ? "proven" : "uncertain"} ${r.kind === "adoptive" ? "adoptive" : ""}`}
                />
              );
            })}
          </svg>
          {layout.nodes.map(({ person, x, y, role }) => (
            <button
              key={person.id}
              className={`person-node ${selectedId === person.id ? "selected" : ""} ${person.id === focusId ? "focused" : ""}`}
              style={{ left: x, top: y }}
              onClick={() => onSelect(person.id)}
              aria-label={`Zobraziť osobu ${fullName(person)}, ${lifeDates(person)}`}
            >
              <span className="node-top">
                <Avatar person={person} />
                <span className="node-generation">
                  {role}
                </span>
              </span>
              <strong>{fullName(person)}</strong>
              <span className="node-dates">{lifeDates(person)}</span>
              <i
                className={`node-dot ${isSupported(person.status) ? "proven" : ""}`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Details({
  family,
  person,
  onSelect,
  onFocus,
  onEdit,
  onRemove,
  onLink,
  onRemoveLink,
}) {
  if (!person)
    return (
      <aside className="detail-panel">
        <div className="detail-empty">
          <Sprout size={30} />
          <h3>Každá osoba má svoj príbeh</h3>
          <p>
            Vyberte osobu v rodokmeni a pozrite si jej údaje, príbuzných a
            zdroje.
          </p>
        </div>
      </aside>
    );
  const rels = relatives(family, person.id);
  return (
    <aside className="detail-panel">
      <div className="detail-heading">
        <span>DETAIL OSOBY</span>
        <button
          className="icon-button"
          aria-label="Upraviť osobu"
          onClick={onEdit}
        >
          <Pencil size={16} />
        </button>
      </div>
      <div className="profile">
        <Avatar person={person} large />
        <h2>{fullName(person)}</h2>
        <p>
          {person.birthName
            ? `rod. ${person.birthName}`
            : person.id.slice(0, 8)}
        </p>
        <Status value={person.status} />
      </div>
      <dl className="facts">
        <div>
          <dt>
            <CalendarDays size={15} />
            Narodenie
          </dt>
          <dd>{displayDate(person.birthDate)}</dd>
        </div>
        <div>
          <dt>
            <MapPin size={15} />
            Rodisko
          </dt>
          <dd>{person.birthPlace || "Neuvedené"}</dd>
        </div>
        {person.deathDate && (
          <div>
            <dt>
              <CalendarDays size={15} />
              Úmrtie
            </dt>
            <dd>{displayDate(person.deathDate)}</dd>
          </div>
        )}
      </dl>
      <div className="detail-section">
        <h3>
          Rodinné väzby
          <button
            className="icon-button"
            aria-label="Pridať rodinnú väzbu"
            onClick={onLink}
          >
            <Plus size={17} />
          </button>
        </h3>
        {[
          ["parents", "Rodičia"],
          ["partners", "Partneri"],
          ["children", "Deti"],
          ["siblings", "Súrodenci"],
        ].map(
          ([key, label]) =>
            rels[key].length > 0 && (
              <div className="relative-group" key={key}>
                <span className="small-label">{label}</span>
                {rels[key].map(({ person: relative, relation, inferred }) => (
                  <div className="relative-row" key={relative.id}>
                    <button
                      className="relative"
                      onClick={() => onSelect(relative.id)}
                    >
                      <Avatar person={relative} />
                      <span>
                        <strong>{fullName(relative)}</strong>
                        <small>
                          {inferred
                            ? "Spoločný rodič podľa väzieb"
                            : kindLabel(relation.kind)}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                    {!inferred && (
                      <button
                        className="remove-link"
                        aria-label={`Odstrániť väzbu s ${fullName(relative)}`}
                        title={`${STATUS_LABELS[relation.status]} · ${relation.source || "Zdroj neuvedený"}`}
                        onClick={() => onRemoveLink(relation)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ),
        )}
        {Object.values(rels).every((r) => !r.length) && (
          <p className="muted">Zatiaľ bez pripojených príbuzných.</p>
        )}
      </div>
      <div className="detail-section">
        <h3>
          <FileText size={15} />
          Zdroj údajov
        </h3>
        <p className="source-text">
          {person.source || "Zdroj zatiaľ nebol uvedený."}
        </p>
      </div>
      {person.note && (
        <div className="detail-section">
          <h3>
            <CircleHelp size={15} />
            Poznámky a neistoty
          </h3>
          <p className="source-text">{person.note}</p>
        </div>
      )}
      <div className="detail-actions">
        <button className="button secondary" onClick={onFocus}>
          <Network size={15} />
          Zamerať strom
        </button>
        <button
          className="icon-button danger"
          onClick={onRemove}
          aria-label="Odstrániť osobu"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  const [family, setFamily] = useState(emptyFamily),
    [loaded, setLoaded] = useState(false),
    [selectedId, setSelectedId] = useState(""),
    [focusId, setFocusId] = useState(""),
    [view, setView] = useState("tree"),
    [modal, setModal] = useState(null),
    [zoom, setZoom] = useState(0.9),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [storageError, setStorageError] = useState(""),
    [menu, setMenu] = useState(false);
  const fileInput = useRef(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let saved;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
        } catch {
          setStorageError(
            "Prehliadač nepovoľuje ukladanie. Exportujte si zálohu.",
          );
        }
        let data;
        if (saved) {
          try {
            data = parseFamily(saved);
            data = applySeedUpdates(data, initialFamily);
            if (
              !data.people.length &&
              !data.relationships.length &&
              !data.seedRevision
            ) {
              data = parseFamily(JSON.stringify(initialFamily));
            }
          } catch {
            setStorageError(
              "Uložené údaje sa nedajú načítať. Pôvodný zápis zostáva zachovaný; môžete importovať platnú zálohu.",
            );
            if (!cancelled) setLoaded(false);
            return;
          }
        } else {
          try {
            const embedded = document.getElementById("family-seed");
            if (embedded) {
              data = parseFamily(embedded.textContent);
            } else if (import.meta.env.DEV) {
              const r = await fetch("/api/family");
              if (!r.ok) throw new Error();
              data = parseFamily(await r.text());
              if (
                !data.people.length &&
                !data.relationships.length &&
                !data.seedRevision
              ) {
                data = parseFamily(JSON.stringify(initialFamily));
              }
            } else {
              data = parseFamily(JSON.stringify(initialFamily));
            }
          } catch {
            data = parseFamily(JSON.stringify(initialFamily));
          }
        }
        if (!cancelled) {
          setFamily(data);
          setSelectedId(data.people[0]?.id || "");
          setFocusId(data.people[0]?.id || "");
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setStorageError(
            "Údaje sa nepodarilo načítať. Importujte platnú zálohu.",
          );
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(family));
      setStorageError("");
    } catch {
      setStorageError(
        "Zmeny sa nedajú uložiť v prehliadači. Pred zatvorením exportujte zálohu.",
      );
    }
  }, [family, loaded]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const selected = family.people.find((p) => p.id === selectedId);
  const filtered = family.people.filter((p) =>
    `${fullName(p)} ${p.birthName} ${p.birthPlace} ${p.birthDate}`
      .toLocaleLowerCase("sk")
      .includes(query.toLocaleLowerCase("sk")),
  );
  const supportedCount = family.people.filter((p) =>
    isSupported(p.status),
  ).length;
  const navigate = (target) => {
    setView(target);
    setMenu(false);
    setQuery("");
  };
  const exportFamily = () => {
    const blob = new Blob([JSON.stringify(family, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `rodokmen-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Záloha je pripravená na stiahnutie. Obsahuje súkromné údaje.");
  };
  const importFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Súbor môže mať najviac 10 MB.");
      setModal({ type: "import", data: parseFamily(await file.text()) });
    } catch (err) {
      setNotice(err.message);
    }
  };
  const savePerson = (person) => {
    setFamily({
      ...family,
      people: family.people.some((p) => p.id === person.id)
        ? family.people.map((p) => (p.id === person.id ? person : p))
        : [...family.people, person],
    });
    setSelectedId(person.id);
    if (!focusId) setFocusId(person.id);
    setModal(null);
    setNotice("Osoba bola uložená.");
  };
  const newPerson = () => {
    if (!loaded) {
      setNotice(
        "Najprv importujte platnú zálohu, aby ste neprepísali nenačítané údaje.",
      );
      return;
    }
    setModal({ type: "person" });
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("tree");
          }}
        >
          <span className="brand-symbol">
            <Sprout size={26} strokeWidth={1.5} />
          </span>
          <span>
            Ďurišovci<small>VAŠA RODINNÁ HISTÓRIA</small>
          </span>
        </a>
        <div className="workspace-label">OSOBNÝ PRIESTOR</div>
        <nav aria-label="Hlavná navigácia">
          <button
            className={view === "tree" ? "active" : ""}
            onClick={() => navigate("tree")}
          >
            <Network size={18} />
            Rodokmeň
            <span className="nav-dot" />
          </button>
          <button
            className={view === "people" ? "active" : ""}
            onClick={() => navigate("people")}
          >
            <Users size={18} />
            Ľudia<span className="nav-count">{family.people.length}</span>
          </button>
          <button
            className={view === "research" ? "active" : ""}
            onClick={() => navigate("research")}
          >
            <BookOpen size={18} />
            Výskumný denník
            <span className="nav-count">{family.questions.length}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-leaf">
            <Sprout size={24} strokeWidth={1.2} />
          </span>
          <h3>
            Malé spomienky.
            <br />
            Veľký príbeh.
          </h3>
          <p>Aj jediné meno môže otvoriť dvere k ďalšej generácii.</p>
          <div className="sidebar-line" />
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => fileInput.current.click()}>
            <Upload size={16} />
            Importovať zálohu
          </button>
          <button onClick={exportFamily}>
            <Download size={16} />
            Exportovať rodokmeň
          </button>
          <div className="local-note">
            <ShieldCheck size={16} />
            <span>
              Údaje v tomto prehliadači
              <small>Nezabudnite si vytvárať zálohy</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Otvoriť menu"
            >
              <Menu size={20} />
            </button>
            <span>Môj rodokmeň</span>
            <ChevronRight size={13} />
            <strong>
              {view === "tree"
                ? "Prehľad"
                : view === "people"
                  ? "Ľudia"
                  : "Výskum"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`save-state ${storageError ? "warning" : ""}`}>
              <i />
              {storageError
                ? "Ukladanie vyžaduje pozornosť"
                : loaded
                  ? "Uložené v prehliadači"
                  : "Načítavam údaje"}
            </span>
            <span className="account-avatar">
              <Sprout size={17} />
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                RODINNÉ KORENE, ŽIVÉ PRÍBEHY
              </div>
              <h1>
                {view === "tree"
                  ? "Všetko sa začína rodinou."
                  : view === "people"
                    ? "Ľudia vášho príbehu."
                    : "Po stopách našich predkov."}
              </h1>
              <p>
                {view === "tree"
                  ? "Uchovajte mená, spojte generácie a objavujte, odkiaľ pochádzate."
                  : view === "people"
                    ? "Každé meno má svoje miesto. Každý údaj svoj zdroj."
                    : "Od rodinných spomienok k doloženým záznamom. Krok za krokom."}
              </p>
            </div>
            <button className="button primary" onClick={newPerson}>
              <Plus size={17} />
              Pridať osobu
            </button>
          </div>
          {storageError && (
            <div className="alert" role="alert">
              <Info size={17} />
              {storageError}
            </div>
          )}
          <div className="stats-grid">
            {[
              [
                Users,
                family.people.length,
                "Osôb v rodokmeni",
                "Každá má svoj príbeh",
              ],
              [
                Network,
                generations(family),
                "Generácie",
                "Spojené rodinnými väzbami",
              ],
              [
                Link2,
                family.relationships.length,
                "Rodinné väzby",
                "Vrátane adoptívnych vzťahov",
              ],
              [
                FileText,
                supportedCount,
                "Doložené osoby",
                "So zdrojom a stavom dôkazu",
              ],
            ].map(([Icon, value, label, hint]) => (
              <div className="stat-card" key={label}>
                <div className="stat-icon">
                  <Icon size={19} strokeWidth={1.6} />
                </div>
                <div>
                  <span className="stat-value">
                    {value.toString().padStart(2, "0")}
                  </span>
                  <h3>{label}</h3>
                  <p>{hint}</p>
                </div>
              </div>
            ))}
          </div>
          {view === "tree" ? (
            <div className="workspace-grid">
              <section className="tree-panel">
                <div className="panel-header">
                  <div>
                    <h2>
                      {family.title || "Môj rodokmeň"}
                      <span className="subtle-tag">RODOKMEŇ</span>
                    </h2>
                    <p>
                      Tri generácie predkov, príbuzní a deti vybranej osoby.
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    onClick={exportFamily}
                    aria-label="Exportovať rodokmeň"
                  >
                    <Download size={18} />
                  </button>
                </div>
                <div className="tree-toolbar">
                  <span>
                    <span className="tree-dot" />
                    Rodinné väzby
                  </span>
                  <label className="focus-select">
                    <span>Zameranie</span>
                    <select
                      aria-label="Východisková osoba stromu"
                      value={focusId}
                      onChange={(e) => {
                        setFocusId(e.target.value);
                        setSelectedId(e.target.value);
                      }}
                    >
                      {!family.people.length && (
                        <option value="">Bez osôb</option>
                      )}
                      {family.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {fullName(p)} · {p.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                </div>
                <Tree
                  family={family}
                  focusId={focusId}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  zoom={zoom}
                  onAdd={newPerson}
                />
                <div className="tree-footer">
                  <div className="legend">
                    <span>
                      <i className="dashed" />
                      Neoverená väzba
                    </span>
                    <span>
                      <i className="adoptive" />
                      Adoptívna
                    </span>
                  </div>
                  <div className="zoom-controls">
                    <button
                      className="icon-button"
                      aria-label="Oddialiť"
                      disabled={zoom <= 0.5}
                      onClick={() =>
                        setZoom((z) =>
                          Math.max(0.5, Math.round((z - 0.1) * 10) / 10),
                        )
                      }
                    >
                      <Minus size={15} />
                    </button>
                    <span>{Math.round(zoom * 100)} %</span>
                    <button
                      className="icon-button"
                      aria-label="Priblížiť"
                      disabled={zoom >= 1.5}
                      onClick={() =>
                        setZoom((z) =>
                          Math.min(1.5, Math.round((z + 0.1) * 10) / 10),
                        )
                      }
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Obnoviť mierku"
                      onClick={() => setZoom(0.9)}
                    >
                      <Maximize size={14} />
                    </button>
                  </div>
                </div>
                <div className="tree-explainer">
                  <Info size={14} />
                  <p>
                    Strom zachytáva oznámené väzby. Prerušovaná čiara znamená,
                    že vzťah ešte nie je doložený záznamom.
                  </p>
                </div>
              </section>
              <Details
                family={family}
                person={selected}
                onSelect={setSelectedId}
                onFocus={() => {
                  setFocusId(selectedId);
                  setNotice("Strom je zameraný na vybranú osobu.");
                }}
                onEdit={() => setModal({ type: "person", initial: selected })}
                onRemove={() => setModal({ type: "delete", person: selected })}
                onLink={() => setModal({ type: "relationship" })}
                onRemoveLink={(relation) =>
                  setModal({ type: "deleteLink", relation })
                }
              />
            </div>
          ) : view === "people" ? (
            <section className="people-panel">
              <div className="panel-header">
                <div>
                  <h2>
                    Rodinný zoznam
                    <span className="subtle-tag">
                      {family.people.length} OSÔB
                    </span>
                  </h2>
                  <p>Vyberte meno a otvorte jeho príbeh v rodokmeni.</p>
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Vyhľadať osobu"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Hľadať meno alebo miesto…"
                  />
                </label>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Osoba</th>
                      <th>Narodenie</th>
                      <th>Miesto narodenia</th>
                      <th>Stav údajov</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="person-cell"
                            onClick={() => {
                              setSelectedId(p.id);
                              setFocusId(p.id);
                              navigate("tree");
                            }}
                          >
                            <Avatar person={p} />
                            <span>
                              <strong>{fullName(p)}</strong>
                              <small>
                                {p.birthName
                                  ? `rod. ${p.birthName}`
                                  : p.id.slice(0, 8)}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>{displayDate(p.birthDate)}</td>
                        <td>{p.birthPlace || "Neuvedené"}</td>
                        <td>
                          <Status value={p.status} />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            onClick={() =>
                              setModal({ type: "person", initial: p })
                            }
                            aria-label={`Upraviť ${fullName(p)}`}
                          >
                            <Pencil size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="no-results">
                    {query
                      ? "Pre toto hľadanie sme nenašli osobu."
                      : "Pridajte prvú osobu alebo importujte zálohu."}
                  </p>
                )}
              </div>
            </section>
          ) : (
            <section className="research-panel">
              <div className="panel-header">
                <div>
                  <h2>
                    Výskumné otázky
                    <span className="subtle-tag">PRACOVNÝ ZÁZNAM</span>
                  </h2>
                  <p>
                    Rodinné údaje zostávajú neoverené, kým nemajú dohľadateľný
                    dôkaz.
                  </p>
                </div>
                <BookOpen size={23} strokeWidth={1.4} />
              </div>
              <div className="research-questions">
                {family.questions.length ? (
                  family.questions.map((q) => (
                    <article key={q.id} className="question-card">
                      <span className="question-id">{q.id}</span>
                      <div>
                        <h3>{q.title}</h3>
                        <p>{q.detail}</p>
                        <span className="question-status">
                          <i />
                          {q.status}
                        </span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="research-empty">
                    <Sprout size={27} />
                    <h3>Začnite od toho, čo poznáte.</h3>
                    <p>
                      Pri osobe zapíšte konkrétnu otázku do poznámky a pridajte
                      zdroj každého nálezu.
                    </p>
                  </div>
                )}
              </div>
              {family.sources?.length > 0 && (
                <div className="research-sources">
                  <h3>Použité zdroje</h3>
                  {family.sources.map((source) => (
                    <article key={source.id}>
                      <span className="question-id">{source.id}</span>
                      <div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.title}
                          <ArrowUpRight size={14} />
                        </a>
                        <p>{source.note}</p>
                        <small>
                          Kontrola: {displayDate(source.checked)} · Rozsah
                          dôkazu je uvedený pri zdroji
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="research-guidance">
                <div className="guidance-icon">
                  <FileText size={21} />
                </div>
                <div>
                  <h3>Najbližší krok: rodinné doklady a obdobie</h3>
                  <p>
                    Mená rodičov, rodné priezviská a približné roky nám pomôžu
                    vybrať správnu matriku. Miesto pobytu nemusí byť rodisko.
                    Zhodné meno samo osebe nepotvrdzuje totožnosť.
                  </p>
                  <p>
                    Kontakty a informácie o archívoch pomáhajú vybrať ďalší
                    krok. Samotnú osobu alebo príbuzenský vzťah však dokladá až
                    konkrétny záznam. Prepis, rodinné podanie a záver zapisujte
                    oddelene.
                  </p>
                </div>
              </div>
            </section>
          )}
          <section className="story-banner">
            <div className="banner-art">
              <Sprout size={65} strokeWidth={0.8} />
              <span />
              <span />
            </div>
            <div>
              <span className="eyebrow">KAŽDÝ DETAIL SA POČÍTA</span>
              <h2>Poznáte ďalší kúsok príbehu?</h2>
              <p>
                Meno, miesto či spomienka. Aj malý údaj môže spojiť ďalšiu
                generáciu.
              </p>
            </div>
            <button className="button light" onClick={newPerson}>
              Rozšíriť rodokmeň
              <ArrowUpRight size={17} />
            </button>
          </section>
          <footer className="page-footer">
            <span>
              Ďurišovci<span className="footer-dot">·</span>Vaša rodina. Váš
              príbeh.
            </span>
            <span>
              <ShieldCheck size={13} />
              Záloha zostáva vo vašich rukách
            </span>
          </footer>
        </main>
      </div>
      <input
        type="file"
        accept=".json,application/json"
        className="file-input"
        ref={fileInput}
        onChange={importFile}
        aria-label="Importovať JSON zálohu"
      />
      {notice && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{notice}</span>
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Zavrieť oznámenie"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal?.type === "person" && (
        <PersonForm
          initial={modal.initial}
          onSave={savePerson}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "relationship" && selected && (
        <RelationshipForm
          family={family}
          person={selected}
          onSave={(data) => {
            setFamily(data);
            setModal(null);
            setNotice("Rodinná väzba bola uložená.");
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "delete" && (
        <Modal title="Odstrániť osobu?" onClose={() => setModal(null)}>
          <div className="confirm-body">
            <p>
              Odstránite osobu <strong>{fullName(modal.person)}</strong> a
              všetky jej rodinné väzby. Ostatné osoby zostanú zachované.
            </p>
            <p>Pred odstránením si môžete vytvoriť exportovanú zálohu.</p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Zrušiť
              </button>
              <button
                className="button destructive"
                onClick={() => {
                  const next = removePerson(family, modal.person.id);
                  setFamily(next);
                  if (focusId === modal.person.id)
                    setFocusId(next.people[0]?.id || "");
                  setSelectedId(next.people[0]?.id || "");
                  setModal(null);
                  setNotice("Osoba a jej väzby boli odstránené.");
                }}
              >
                Odstrániť osobu
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === "deleteLink" && (
        <Modal title="Odstrániť rodinnú väzbu?" onClose={() => setModal(null)}>
          <div className="confirm-body">
            <p>Osoby zostanú zachované. Odstráni sa iba toto prepojenie.</p>
            <p>
              <strong>{kindLabel(modal.relation.kind)}</strong>
              <br />
              {STATUS_LABELS[modal.relation.status]}
              <br />
              {modal.relation.source || "Zdroj neuvedený"}
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Zrušiť
              </button>
              <button
                className="button destructive"
                onClick={() => {
                  setFamily({
                    ...family,
                    relationships: family.relationships.filter(
                      (r) => r.id !== modal.relation.id,
                    ),
                  });
                  setModal(null);
                }}
              >
                Odstrániť väzbu
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === "import" && (
        <Modal title="Importovať rodokmeň?" onClose={() => setModal(null)}>
          <div className="confirm-body">
            <p>
              Záloha obsahuje <strong>{modal.data.people.length} osôb</strong> a{" "}
              <strong>{modal.data.relationships.length} vzťahov</strong>.
            </p>
            <p>
              Import nahradí aktuálny rodokmeň. Pred pokračovaním si exportujte
              jeho zálohu.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Zrušiť
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setFamily({
                    ...modal.data,
                    seedRevision: Math.max(
                      modal.data.seedRevision || 0,
                      initialFamily.seedRevision,
                    ),
                  });
                  setSelectedId(modal.data.people[0]?.id || "");
                  setFocusId(modal.data.people[0]?.id || "");
                  setLoaded(true);
                  setModal(null);
                  setNotice("Rodokmeň bol importovaný.");
                }}
              >
                Nahradiť a importovať
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
