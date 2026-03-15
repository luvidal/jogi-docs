'use strict';

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
      rawDoctypes: null,
      resetDoctypesCache: null
    };
  }
  return g[GLOBAL_KEY];
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
function setResetDoctypesCache(fn) {
  getGlobal().resetDoctypesCache = fn;
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
var expandedCache = null;
setResetDoctypesCache(() => {
  expandedCache = null;
});
function getExpandedDoctypes() {
  if (expandedCache) return expandedCache;
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
  expandedCache = expanded;
  return expanded;
}
function getDoctypesMap() {
  return getExpandedDoctypes();
}

// src/multipart.ts
var PART_IDS = {
  "Frente": "front",
  "Rev\xE9s": "back"
};
function getMultiPartConfig(doctypeid) {
  const doctype = getDoctypesMap()[doctypeid];
  if (!doctype?.parts || doctype.parts.length === 0) return null;
  return {
    enabled: true,
    parts: doctype.parts.map((label) => ({
      id: PART_IDS[label] || label.toLowerCase(),
      label
    }))
  };
}
function isMultiPartDocType(doctypeid) {
  const doctype = getDoctypesMap()[doctypeid];
  return !!(doctype?.parts && doctype.parts.length > 0);
}
function getMultiPartDocTypeIds() {
  const doctypes = getDoctypesMap();
  return Object.entries(doctypes).filter(([, dt]) => dt.parts && dt.parts.length > 0).map(([id]) => id);
}
function getPartIdFromFilename(filename) {
  const match = filename.match(/[_ ](front|back)\.\w+$/);
  if (match) return match[1];
  const labelMatch = filename.match(/[_ ](Frente|Revés|Reves)\.\w+$/i);
  if (labelMatch) {
    const label = labelMatch[1];
    if (/^frente$/i.test(label)) return "front";
    if (/^rev[eé]s$/i.test(label)) return "back";
  }
  return null;
}
function getDocTypeFromFilename(filename) {
  const match = filename.match(/_([^_]+)_[^_]+\.pdf$/);
  return match?.[1] || null;
}
function isMultiPartFile(filename, doctypeid) {
  const config = getMultiPartConfig(doctypeid);
  if (!config) return false;
  const partId = getPartIdFromFilename(filename);
  if (!partId) return false;
  return config.parts.some((p) => p.id === partId);
}
function getPartLabel(doctypeid, partId) {
  const config = getMultiPartConfig(doctypeid);
  if (!config) return null;
  const part = config.parts.find((p) => p.id === partId);
  return part?.label || null;
}
function partFilenameConditions(partId, doctypeid) {
  const extensions = ["pdf", "jpg", "jpeg", "png"];
  const delimiters = ["_", " "];
  const names = [partId];
  if (doctypeid) {
    const label = getPartLabel(doctypeid, partId);
    if (label && label !== partId) names.push(label);
  }
  return names.flatMap(
    (name) => delimiters.flatMap(
      (d) => extensions.map((ext) => ({ filename: { endsWith: `${d}${name}.${ext}` } }))
    )
  );
}

exports.getDocTypeFromFilename = getDocTypeFromFilename;
exports.getMultiPartConfig = getMultiPartConfig;
exports.getMultiPartDocTypeIds = getMultiPartDocTypeIds;
exports.getPartIdFromFilename = getPartIdFromFilename;
exports.getPartLabel = getPartLabel;
exports.isMultiPartDocType = isMultiPartDocType;
exports.isMultiPartFile = isMultiPartFile;
exports.partFilenameConditions = partFilenameConditions;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map