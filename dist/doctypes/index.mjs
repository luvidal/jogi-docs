// src/config.ts
var GLOBAL_KEY = "__avd_docprocessor__";
function getGlobal() {
  const g = globalThis;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      logger: {
        error: (err, ctx) => console.error("[docprocessor]", err, ctx),
        warn: (msg, ctx) => console.warn("[docprocessor]", msg, ctx)
      },
      rawDoctypes: null
    };
  }
  return g[GLOBAL_KEY];
}
function configure(options) {
  const state = getGlobal();
  if (options.logger) state.logger = options.logger;
  if (options.doctypes) {
    state.rawDoctypes = options.doctypes;
  }
}
function getRawDoctypes() {
  const raw = getGlobal().rawDoctypes;
  if (!raw) {
    throw new Error(
      "@jogi/docprocessor: doctypes not configured. Call configure({ doctypes }) before using doctype functions."
    );
  }
  return raw;
}

// src/doctypes.ts
var TYPE_DEFAULTS = {
  string: "",
  date: "YYYY-MM-DD",
  month: "YYYY-MM",
  time: "HH:MM",
  num: 0,
  bool: false,
  list: [],
  obj: {}
};
function expandFields(fieldDefs) {
  const result = {};
  const internalFields = /* @__PURE__ */ new Set();
  for (const field of fieldDefs) {
    const defaultValue = TYPE_DEFAULTS[field.type] ?? "";
    const parts = field.key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = defaultValue;
    if (field.internal) {
      internalFields.add(field.key);
    }
  }
  return { fields: result, internalFields };
}
function generateInstructions(fieldDefs) {
  const simple = [];
  const custom = [];
  for (const field of fieldDefs) {
    if (field.ai) {
      custom.push(`${field.key}: ${field.ai}`);
    } else {
      const label = field.key.replace(/\./g, " \u2192 ");
      simple.push(field.type !== "string" ? `${label} (${field.type})` : label);
    }
  }
  const parts = [];
  if (simple.length > 0) {
    parts.push(`Extrae: ${simple.join(", ")}.`);
  }
  if (custom.length > 0) {
    parts.push(custom.join(". ") + ".");
  }
  return parts.join(" ");
}
function getExpandedDoctypes() {
  const raw = getRawDoctypes();
  const expanded = {};
  for (const [id, dt] of Object.entries(raw)) {
    const { fields, internalFields } = expandFields(dt.fields);
    expanded[id] = {
      label: dt.label,
      shortLabel: dt.shortLabel,
      category: dt.category,
      freq: dt.freq || "once",
      count: dt.count ?? 1,
      maxAge: dt.maxAge,
      graceDays: dt.graceDays,
      hasFechaVencimiento: dt.fields?.some((f) => f.key === "fecha_vencimiento") ?? false,
      multiInstance: dt.multiInstance,
      parts: dt.parts,
      definition: dt.definition,
      dateHint: dt.dateHint,
      instructions: generateInstructions(dt.fields),
      fields,
      fieldDefs: dt.fields,
      internalFields,
      howToObtain: dt.howToObtain
    };
  }
  return expanded;
}
function getDoctypesMap() {
  return getExpandedDoctypes();
}
function getDoctypes() {
  const map = getDoctypesMap();
  return Object.entries(map).map(([id, doctype]) => ({
    id,
    ...doctype
  })).sort((a, b) => a.label.localeCompare(b.label));
}
function getDoctype(id) {
  const map = getDoctypesMap();
  const doctype = map[id];
  if (!doctype) return null;
  return { id, ...doctype };
}
function getDoctypeIds() {
  return Object.keys(getDoctypesMap());
}
function isDoctypeValid(id) {
  return id in getDoctypesMap();
}
function isMultiInstanceDocType(id) {
  return getDoctypesMap()[id]?.multiInstance === true;
}
function getDoctypesLegacyFormat() {
  return getDoctypes().map((dt) => ({
    id: dt.id,
    label: dt.label,
    definition: dt.definition,
    instructions: dt.instructions,
    fields: dt.fields,
    category: dt.category,
    multiInstance: dt.multiInstance || void 0
  }));
}
function getDoctypesByCategory(category) {
  return getDoctypes().filter((dt) => dt.category === category);
}
function getCategories() {
  const categories = new Set(
    getDoctypes().map((dt) => dt.category).filter(Boolean)
  );
  return Array.from(categories);
}
function getInternalFieldKeys(doctypeId) {
  const dt = getDoctypesMap()[doctypeId];
  if (!dt) return [];
  return [...dt.internalFields];
}
function getDocumentDefaults(doctypeid) {
  const dt = getDoctypesMap()[doctypeid];
  return dt ? { freq: dt.freq, count: dt.count } : { freq: "once", count: 1 };
}
function isRecurring(doctypeid) {
  const dt = getDoctypesMap()[doctypeid];
  return dt?.freq === "monthly" || dt?.freq === "annual";
}
function isValidFreq(freq) {
  return freq === "once" || freq === "monthly" || freq === "annual";
}
function applyDefaults(requirements) {
  const result = {};
  for (const [doctypeid, req] of Object.entries(requirements)) {
    if (doctypeid === "periodstart") {
      result[doctypeid] = req;
      continue;
    }
    const defaults = getDocumentDefaults(doctypeid);
    const freq = isValidFreq(req?.freq) ? req.freq : defaults.freq;
    const count = typeof req?.count === "number" && req.count > 0 ? req.count : defaults.count;
    result[doctypeid] = { freq, count };
  }
  return result;
}

export { applyDefaults, configure, getCategories, getDoctype, getDoctypeIds, getDoctypes, getDoctypesByCategory, getDoctypesLegacyFormat, getDoctypesMap, getDocumentDefaults, getInternalFieldKeys, isDoctypeValid, isMultiInstanceDocType, isRecurring };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map