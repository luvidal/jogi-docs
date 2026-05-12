'use strict';

var pdfLib = require('pdf-lib');
var sharp2 = require('sharp');
var clientRekognition = require('@aws-sdk/client-rekognition');
var crypto = require('crypto');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var sharp2__default = /*#__PURE__*/_interopDefault(sharp2);

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
      geminiCall: null
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
  if (options.geminiCall) state.geminiCall = options.geminiCall;
}
function getLogger() {
  return getGlobal().logger;
}
function getGeminiCall() {
  return getGlobal().geminiCall;
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

// src/ai.ts
var hasGeminiAuth = () => !!getGeminiCall() || !!process.env.GEMINI_API_KEY;
var toAiModel = (m) => m === "gpt5" ? "GPT" : m === "gemini" ? "GEMINI" : "ANTHROPIC";
var anthropicClient = null;
var openaiClient = null;
var geminiClient = null;
var getAnthropic = async () => {
  if (!anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
  }
  return anthropicClient;
};
var getOpenAI = async () => {
  if (!openaiClient) {
    const { default: OpenAI } = await import('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  }
  return openaiClient;
};
var getGemini = async () => {
  if (!geminiClient) {
    const { GoogleGenAI } = await import('@google/genai');
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }
  return geminiClient;
};
var strict = "Devuelve EXCLUSIVAMENTE JSON v\xE1lido, sin markdown, sin texto adicional";
var stripFences = (txt) => txt.replace(/```json|```/g, "").trim();
var geminiText = (r) => r?.text || r?.candidates?.[0]?.content?.parts?.map?.((p) => p?.text || "").join?.("") || "";
var isRateLimitError = (err) => {
  if (!err) return false;
  const msg = err.message?.toLowerCase?.() || "";
  const status = err.status || err.statusCode || err.code;
  return status === 429 || status === "429" || status === 503 || status === "503" || msg.includes("429") || msg.includes("503") || msg.includes("rate") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("unavailable");
};
var delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var getGeminiCaller = async () => {
  const hosted = getGeminiCall();
  if (hosted) return hosted;
  const gemini = await getGemini();
  return (params) => gemini.models.generateContent(params);
};
var queryGrounded = async (prompt, options) => {
  if (!hasGeminiAuth()) return { text: "" };
  const callGemini = await getGeminiCaller();
  try {
    const r = await callGemini({
      // gemini-2.5-flash (not flash-lite): derived queries search the
      // web and reason over multiple sources, which benefits from the
      // 2.5-flash thinking mode. Flash-Lite doesn't think and tends to
      // return the first plausible number — worse for market-price type
      // lookups. Cost is trivial either way (<1 ¢ per query) and this
      // path is used sparingly.
      model: options?.model ?? "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    const um = r?.usageMetadata;
    return {
      text: geminiText(r),
      usage: um ? { promptTokenCount: um.promptTokenCount, candidatesTokenCount: um.candidatesTokenCount } : void 0
    };
  } catch (err) {
    if (isRateLimitError(err)) return { text: "" };
    throw err;
  }
};
var callAnthropic = async (mimetype, base64, content) => {
  const anthropic = await getAnthropic();
  const visionContent = [
    { type: "text", text: content },
    mimetype === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } : { type: "image", source: { type: "base64", media_type: mimetype, data: base64 } }
  ];
  const r = await anthropic.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 2048, temperature: 0, messages: [{ role: "user", content: visionContent }] });
  const block = r.content?.find((b) => b.type === "text");
  const txt = block?.text?.trim() || "";
  const u = r.usage;
  return {
    text: stripFences(txt),
    usage: u ? { promptTokenCount: u.input_tokens, candidatesTokenCount: u.output_tokens } : void 0
  };
};
var model2vision = async (model, mimetype, base64, prompt, geminiModel, responseSchema) => {
  const content = `${strict}
${prompt}`;
  if (model === "GPT" && process.env.OPENAI_API_KEY) {
    if (mimetype === "application/pdf") throw new Error("GPT no soporta PDF");
    const openai = await getOpenAI();
    const r = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: content }, { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } }]
        }
      ]
    });
    const txt = r.choices?.[0]?.message?.content?.trim() || "";
    const u = r.usage;
    return {
      text: stripFences(txt),
      usage: u ? { promptTokenCount: u.prompt_tokens, candidatesTokenCount: u.completion_tokens } : void 0
    };
  }
  if (model === "ANTHROPIC" && process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(mimetype, base64, content);
  }
  if (model === "GEMINI" && hasGeminiAuth()) {
    const callGemini = await getGeminiCaller();
    const maxRetries = 2;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const r = await callGemini({
          model: geminiModel ?? "gemini-2.5-flash-lite",
          // Vertex AI requires role-tagged messages; AI Studio was
          // lenient with bare { parts: [...] }. Always wrap.
          contents: [{
            role: "user",
            parts: [
              { text: content },
              { inlineData: { mimeType: mimetype, data: base64 } }
            ]
          }],
          config: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            ...responseSchema ? { responseSchema } : {}
          }
        });
        const um = r?.usageMetadata;
        return {
          text: stripFences(geminiText(r)),
          usage: um ? { promptTokenCount: um.promptTokenCount, candidatesTokenCount: um.candidatesTokenCount } : void 0
        };
      } catch (err) {
        lastError = err;
        if (isRateLimitError(err)) throw err;
        if (attempt < maxRetries) {
          await delay(1e3 * (attempt + 1));
          continue;
        }
        break;
      }
    }
    if (lastError) throw lastError;
  }
  return { text: "" };
};

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
      pageAtomic: dt.pageAtomic,
      extractScope: dt.extractScope,
      parts: dt.parts,
      contains: dt.contains,
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
var _client = null;
function getClient(opts) {
  if (_client) return _client;
  _client = new clientRekognition.RekognitionClient({
    region: opts?.region || process.env.AWS_REGION || "us-east-1",
    ...opts?.credentials ? { credentials: opts.credentials } : {}
  });
  return _client;
}
async function extractFace(imageBuffer, _mimetype, _model, opts) {
  const log = getLogger();
  const oriented = await sharp2__default.default(imageBuffer).rotate().toBuffer();
  const metadata = await sharp2__default.default(oriented).metadata();
  const imgW = metadata.width || 0;
  const imgH = metadata.height || 0;
  if (!imgW || !imgH) return null;
  const client = getClient(opts);
  let faces;
  try {
    const cmd = new clientRekognition.DetectFacesCommand({
      Image: { Bytes: oriented },
      Attributes: ["DEFAULT"]
    });
    const res = await client.send(cmd);
    const details = res.FaceDetails || [];
    if (details.length === 0) return null;
    faces = details.map((d) => {
      const bb = d.BoundingBox;
      const x = (bb.Left || 0) * 100;
      const y = (bb.Top || 0) * 100;
      const width = (bb.Width || 0) * 100;
      const height = (bb.Height || 0) * 100;
      return {
        bbox: { x, y, width, height },
        confidence: d.Confidence || 0,
        area: width * height
      };
    });
  } catch (err) {
    log.error(err, { module: "face-extract-v4", action: "rekognition-detect" });
    return null;
  }
  faces.sort((a, b) => b.area - a.area);
  const best = faces[0];
  const faceCX = Math.round((best.bbox.x + best.bbox.width / 2) / 100 * imgW);
  const faceCY = Math.round((best.bbox.y + best.bbox.height / 2) / 100 * imgH);
  const faceH = Math.round(best.bbox.height / 100 * imgH);
  const side = Math.min(Math.round(faceH * 1.3), imgW, imgH);
  const dLeft = faceCX - Math.floor(side / 2);
  const dTop = faceCY - Math.floor(side * 0.55);
  const extL = Math.max(0, -dLeft);
  const extT = Math.max(0, -dTop);
  const extR = Math.max(0, dLeft + side - imgW);
  const extB = Math.max(0, dTop + side - imgH);
  if (side <= 10) return null;
  const extW = imgW + extL + extR;
  const extH = imgH + extT + extB;
  const cropLeft = Math.max(0, Math.min(dLeft + extL, extW - 1));
  const cropTop = Math.max(0, Math.min(dTop + extT, extH - 1));
  const cropW = Math.max(0, Math.min(side, extW - cropLeft));
  const cropH = Math.max(0, Math.min(side, extH - cropTop));
  if (cropW < 32 || cropH < 32) return null;
  let face;
  try {
    const needsExtend = extL || extR || extT || extB;
    const extended = needsExtend ? await sharp2__default.default(oriented).extend({ top: extT, bottom: extB, left: extL, right: extR, background: "#FFFFFF" }).toBuffer() : oriented;
    const photo = await sharp2__default.default(extended).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).resize(256, 256).jpeg({ quality: 92 }).toBuffer();
    if (photo.length < 5e3) return null;
    face = photo.toString("base64");
  } catch (err) {
    log.error(err, {
      module: "face-extract-v4",
      action: "crop",
      // Surface the rect + frame so the next failure is diagnosable
      // without having to reproduce locally.
      imgW,
      imgH,
      extL,
      extR,
      extT,
      extB,
      extW,
      extH,
      cropLeft,
      cropTop,
      cropW,
      cropH,
      side,
      bbox: best.bbox
    });
    return null;
  }
  return {
    face,
    bbox: best.bbox,
    confidence: best.confidence,
    facesDetected: faces.length
  };
}
function addUsage(total, add) {
  if (!add) return total;
  return {
    promptTokenCount: (total.promptTokenCount ?? 0) + (add.promptTokenCount ?? 0),
    candidatesTokenCount: (total.candidatesTokenCount ?? 0) + (add.candidatesTokenCount ?? 0)
  };
}
var PROMPT_TEMPLATE_VERSION = "v12";
function getPromptVersion() {
  return crypto.createHash("sha256").update(JSON.stringify(getDoctypes())).update(PROMPT_TEMPLATE_VERSION).update(JSON.stringify(getSchemaVersionPayload())).digest("hex").slice(0, 12);
}
function buildCacheKey(fileHash, model, promptVersion) {
  return crypto.createHash("sha256").update(fileHash + model + promptVersion).digest("hex").slice(0, 32);
}
var pdfToPngModule = null;
var getPdfToPng = async () => {
  if (!pdfToPngModule) {
    pdfToPngModule = await import('pdf-to-png-converter');
  }
  return pdfToPngModule.pdfToPng;
};
async function extractPdfPageAsImage(pdfBuffer, pageNumber) {
  try {
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    );
    const pdfToPng = await getPdfToPng();
    const pages = await pdfToPng(arrayBuffer, {
      pagesToProcess: [pageNumber],
      viewportScale: 2,
      returnPageContent: true
    });
    if (pages.length > 0 && pages[0].content) {
      return Buffer.from(pages[0].content);
    }
    return null;
  } catch {
    return null;
  }
}
async function detectCedulaSide(buffer, mimetype, model = "gemini") {
  const isImage = mimetype.startsWith("image/");
  const isPDF = mimetype === "application/pdf";
  if (!isImage && !isPDF) throw new Error("Images and PDFs only");
  const base64 = buffer.toString("base64");
  const prompt = `
    Analiza esta imagen de una C\xE9dula de Identidad chilena y determina si es el FRENTE o el REV\xC9S.

    **FRENTE (front)** - Caracter\xEDsticas:
    - Foto del titular
    - Nombre completo
    - RUT
    - Nacionalidad
    - Fecha de nacimiento
    - Sexo
    - N\xFAmero de documento
    - Fecha de emisi\xF3n/vencimiento

    **REV\xC9S (back)** - Caracter\xEDsticas:
    - Huella dactilar
    - Firma del titular
    - C\xF3digo de barras o QR
    - Direcci\xF3n (en c\xE9dulas antiguas)
    - Profesi\xF3n u oficio
    - Texto institucional del Registro Civil

    Devuelve SOLO este JSON:
    {
      "side": "front" | "back" | null,
      "confidence": 0.0-1.0,
      "reason": "breve explicaci\xF3n",
      "data": {
        // Si es front: rut, nombres, apellidos, fecha_nacimiento, foto_bbox, etc.
        // Si es back: profesion, lugar_nacimiento ("Naci\xF3 en"), direccion (si visible)
      }
    }

    **UBICACI\xD3N DE LA FOTO (solo si es FRENTE)**:
    Si detectas que es el FRENTE de la c\xE9dula, incluye el campo "foto_bbox" con las coordenadas del recuadro de la foto del titular.
    Las coordenadas deben ser porcentajes (0-100) relativos al tama\xF1o de la imagen.
    IMPORTANTE: La foto incluye cabeza completa, cuello y parte de los hombros. Incluye TODO el rostro desde la parte superior de la cabeza.
    - x: posici\xF3n horizontal del borde izquierdo de la foto
    - y: posici\xF3n vertical del borde superior de la foto (empieza ARRIBA de la cabeza)
    - width: ancho de la foto
    - height: alto de la foto (debe cubrir desde arriba de la cabeza hasta los hombros)
    En c\xE9dulas chilenas, la foto t\xEDpicamente est\xE1 en la esquina superior izquierda.
    Ejemplo: "foto_bbox": { "x": 3, "y": 12, "width": 28, "height": 45 }

    Si la imagen NO es una c\xE9dula chilena, devuelve side: null.
    `;
  const aiModel = toAiModel(model);
  const vr = await model2vision(aiModel, mimetype, base64, prompt);
  let text = stripFences(vr.text);
  try {
    const parsed = JSON.parse(text);
    const data = parsed.data || {};
    if (parsed.side === "front") {
      let imageBuffer = null;
      if (isImage) {
        imageBuffer = buffer;
      } else if (isPDF) {
        imageBuffer = await extractPdfPageAsImage(buffer, 1);
      }
      if (imageBuffer) {
        const result = await extractFace(imageBuffer);
        if (result) {
          data.foto_base64 = result.face;
        }
      }
      delete data.foto_bbox;
    }
    return {
      side: parsed.side === "front" || parsed.side === "back" ? parsed.side : null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      data
    };
  } catch {
    return { side: null, confidence: 0 };
  }
}
function loadSchemas() {
  const doctypes = getDoctypes();
  const mapById = getDoctypesMap();
  return { doctypes, mapById };
}
function parseRawDocs(text) {
  const cleaned = stripFences(text);
  if (!cleaned) return [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && Array.isArray(parsed[0]?.documents)) {
        return parsed.flatMap((p) => p.documents || []);
      }
      return parsed;
    }
    if (Array.isArray(parsed?.documents)) return parsed.documents;
    if (parsed?.id || parsed?.doctypeid) return [parsed];
    return [];
  } catch {
    const recovered = [];
    let i = 0;
    while (i < cleaned.length) {
      if (cleaned[i] === "{") {
        let depth = 0, inStr = false, escape = false;
        const start = i;
        for (; i < cleaned.length; i++) {
          const ch = cleaned[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === "\\" && inStr) {
            escape = true;
            continue;
          }
          if (ch === '"' && !escape) {
            inStr = !inStr;
            continue;
          }
          if (inStr) continue;
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
        }
        if (depth === 0) {
          try {
            const obj = JSON.parse(cleaned.slice(start, i));
            if (obj.id || obj.doctypeid || obj.doc_type_id) recovered.push(obj);
          } catch {
          }
        }
      } else {
        i++;
      }
    }
    return recovered;
  }
}
function normalizeDoc(d) {
  const id = d?.id || d?.doctypeid || null;
  const META_KEYS = /* @__PURE__ */ new Set(["id", "doctypeid", "doc_type_id", "data", "docdate", "document_date", "documentDate", "confidence", "start", "end", "partId", "part_id", "partid", "label"]);
  const flatData = Object.fromEntries(Object.entries(d || {}).filter(([k]) => !META_KEYS.has(k)));
  const data = d?.data && typeof d.data === "object" ? d.data : Object.keys(flatData).length > 0 ? flatData : {};
  const rawDate = d?.docdate || d?.document_date || d?.documentDate || null;
  const docdate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !isNaN((/* @__PURE__ */ new Date(`${rawDate}T12:00:00`)).getTime()) ? rawDate : null;
  const start = Number.isFinite(d?.start) ? Number(d.start) : d?.start ? parseInt(d.start, 10) : void 0;
  const end = Number.isFinite(d?.end) ? Number(d.end) : d?.end ? parseInt(d.end, 10) : void 0;
  const partId = d?.partId || d?.part_id || d?.partid || void 0;
  const confidence = typeof d?.confidence === "number" && d.confidence >= 0 && d.confidence <= 1 ? d.confidence : void 0;
  return { id, data, docdate, start, end, partId, confidence };
}
var DATA_SCHEMA_DOCTYPES = /* @__PURE__ */ new Set([
  "cedula-identidad",
  "liquidaciones-sueldo",
  "informe-deuda",
  "padron",
  "declaracion-anual-impuestos",
  "resumen-boletas-sii"
]);
var STR = { type: "STRING", nullable: true };
var NUM = { type: "NUMBER", nullable: true };
function buildDataSchemaForDoctype(docTypeId) {
  switch (docTypeId) {
    case "cedula-identidad":
      return {
        type: "OBJECT",
        nullable: true,
        properties: {
          rut: STR,
          nombres: STR,
          apellidos: STR,
          nacionalidad: STR,
          sexo: STR,
          fecha_nacimiento: STR,
          numero_documento: STR,
          fecha_emision: STR,
          fecha_vencimiento: STR,
          lugar_nacimiento: STR,
          profesion: STR
        }
      };
    case "liquidaciones-sueldo": {
      const lineItem = {
        type: "OBJECT",
        properties: {
          label: STR,
          value: NUM
        }
      };
      return {
        type: "OBJECT",
        nullable: true,
        properties: {
          empleador: STR,
          nombre: STR,
          rut: STR,
          periodo: STR,
          dias_trabajados: NUM,
          fecha_ingreso: STR,
          cargo: STR,
          institucion_previsional: STR,
          institucion_salud: STR,
          base_imponible: NUM,
          base_tributable: NUM,
          haberes: { type: "ARRAY", nullable: true, items: lineItem },
          descuentos: { type: "ARRAY", nullable: true, items: lineItem }
        }
      };
    }
    case "informe-deuda": {
      const deudaItem = {
        type: "OBJECT",
        properties: {
          entidad: STR,
          tipo: STR,
          total_credito: NUM,
          vigente: NUM,
          atraso_30_59: NUM,
          atraso_60_89: NUM,
          atraso_90_mas: NUM
        }
      };
      const creditoItem = {
        type: "OBJECT",
        properties: {
          entidad: STR,
          directos: NUM,
          indirectos: NUM
        }
      };
      return {
        type: "OBJECT",
        nullable: true,
        properties: {
          rut: STR,
          nombre: STR,
          deuda_total: NUM,
          fecha_informe: STR,
          deudas: { type: "ARRAY", nullable: true, items: deudaItem },
          deudas_indirectas: { type: "ARRAY", nullable: true, items: deudaItem },
          lineas_credito: { type: "ARRAY", nullable: true, items: creditoItem },
          otros_creditos: { type: "ARRAY", nullable: true, items: creditoItem }
        }
      };
    }
    case "padron":
      return {
        type: "OBJECT",
        nullable: true,
        properties: {
          inscripcion: STR,
          rut_propietario: STR,
          propietario: STR,
          domicilio: STR,
          comuna: STR,
          fecha_adquisicion: STR,
          fecha_inscripcion: STR,
          fecha_emision: STR,
          marca: STR,
          modelo: STR,
          motor: STR,
          chasis: STR,
          color: STR,
          tasacion_fiscal: NUM,
          "a\xF1o": NUM
        }
      };
    case "declaracion-anual-impuestos": {
      const codeKeys = ["547", "110", "104", "105", "155", "161", "170", "305"];
      const codes = {};
      for (const k of codeKeys) codes[k] = NUM;
      return {
        type: "OBJECT",
        nullable: true,
        properties: {
          rut: STR,
          nombre: STR,
          "a\xF1o_tributario": NUM,
          codes: {
            type: "OBJECT",
            nullable: true,
            properties: codes
          }
        }
      };
    }
    case "resumen-boletas-sii": {
      const monthRow = {
        type: "OBJECT",
        nullable: true,
        properties: {
          boletas_vigentes: NUM,
          honorario_bruto: NUM,
          retencion: NUM,
          liquido: NUM
        }
      };
      const months = {};
      const monthKeys = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre"
      ];
      for (const m of monthKeys) months[m] = monthRow;
      return {
        type: "OBJECT",
        nullable: true,
        properties: {
          rut: STR,
          contribuyente: STR,
          "a\xF1o": NUM,
          totales: {
            type: "OBJECT",
            nullable: true,
            properties: {
              boletas_vigentes: NUM,
              boletas_anuladas: NUM,
              honorario_bruto: NUM,
              retencion_terceros: NUM,
              retencion_contribuyente: NUM,
              total_liquido: NUM
            }
          },
          meses: {
            type: "OBJECT",
            nullable: true,
            properties: months
          }
        }
      };
    }
    default:
      return null;
  }
}
function buildClassifyResponseSchema(doctypeIds, isPDF) {
  const buildBaseProps = (idEnum) => {
    const props = {
      id: { type: "STRING", enum: idEnum },
      confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
      partId: { type: "STRING", enum: ["front", "back"], nullable: true }
    };
    if (isPDF) {
      props.start = { type: "INTEGER", minimum: 1 };
      props.end = { type: "INTEGER", minimum: 1 };
    }
    return props;
  };
  const baseRequired = isPDF ? ["id", "confidence", "start", "end"] : ["id", "confidence"];
  const branches = [];
  const fallbackIds = [];
  for (const id of doctypeIds) {
    const dataSchema = DATA_SCHEMA_DOCTYPES.has(id) ? buildDataSchemaForDoctype(id) : null;
    if (!dataSchema) {
      fallbackIds.push(id);
      continue;
    }
    branches.push({
      type: "OBJECT",
      properties: {
        ...buildBaseProps([id]),
        data: dataSchema,
        docdate: { type: "STRING", nullable: true }
      },
      required: baseRequired
    });
  }
  if (fallbackIds.length > 0 || branches.length === 0) {
    branches.push({
      type: "OBJECT",
      properties: buildBaseProps(fallbackIds.length > 0 ? fallbackIds : doctypeIds),
      required: baseRequired
    });
  }
  const items = branches.length === 1 ? branches[0] : { anyOf: branches };
  return {
    type: "OBJECT",
    properties: {
      documents: {
        type: "ARRAY",
        items
      }
    },
    required: ["documents"]
  };
}
function buildShapeOnlyClassifyResponseSchema(doctypeIds, isPDF) {
  const itemProps = {
    id: { type: "STRING", enum: doctypeIds },
    confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
    partId: { type: "STRING", enum: ["front", "back"], nullable: true }
  };
  const required = isPDF ? ["id", "confidence", "start", "end"] : ["id", "confidence"];
  if (isPDF) {
    itemProps.start = { type: "INTEGER", minimum: 1 };
    itemProps.end = { type: "INTEGER", minimum: 1 };
  }
  return {
    type: "OBJECT",
    properties: {
      documents: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: itemProps,
          required
        }
      }
    },
    required: ["documents"]
  };
}
function isGeminiInvalidArgumentError(err) {
  const e = err;
  const status = e?.status ?? e?.statusCode ?? e?.code;
  const nestedStatus = e?.error?.status ?? e?.error?.code;
  const statusLooks400 = status === 400 || status === "400" || nestedStatus === 400 || nestedStatus === "400";
  const invalidStatus = status === "INVALID_ARGUMENT" || nestedStatus === "INVALID_ARGUMENT";
  const message = [
    e?.message,
    e?.status,
    e?.statusCode,
    e?.code,
    e?.error?.message,
    e?.error?.status,
    e?.error?.code
  ].filter(Boolean).join(" ").toLowerCase();
  const messageLooksInvalid = message.includes("invalid_argument") || message.includes("invalid argument");
  const messageLooks400 = /\b400\b/.test(message) || message.includes("bad request");
  return invalidStatus || statusLooks400 && messageLooksInvalid || messageLooks400 && messageLooksInvalid;
}
function normalizeClassifyDocs(rawDocs, options = {}) {
  const allowed = options.allowedIds ? new Set(options.allowedIds) : null;
  return rawDocs.map((d) => {
    const id = d?.id || d?.doctypeid || d?.doc_type_id || null;
    const start = Number.isFinite(d?.start) ? Number(d.start) : d?.start ? parseInt(d.start, 10) : void 0;
    const end = Number.isFinite(d?.end) ? Number(d.end) : d?.end ? parseInt(d.end, 10) : void 0;
    const partId = d?.partId || d?.part_id || d?.partid || void 0;
    const confidence = typeof d?.confidence === "number" && d.confidence >= 0 && d.confidence <= 1 ? d.confidence : void 0;
    const data = d?.data && typeof d.data === "object" && !Array.isArray(d.data) ? d.data : void 0;
    const rawDate = d?.docdate || d?.document_date || d?.documentDate || null;
    const docdate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !isNaN((/* @__PURE__ */ new Date(`${rawDate}T12:00:00`)).getTime()) ? rawDate : null;
    return {
      id,
      ...Number.isFinite(start) ? { start } : {},
      ...Number.isFinite(end) ? { end } : {},
      ...partId ? { partId } : {},
      ...confidence !== void 0 ? { confidence } : {},
      ...data ? { data } : {},
      ...docdate ? { docdate } : {}
    };
  }).filter(
    (d) => !!d.id && (!allowed || allowed.has(d.id)) && (!options.requireConfidence || typeof d.confidence === "number")
  );
}
function buildExtractResponseSchema(docTypeId, isPDF, entries) {
  if (!DATA_SCHEMA_DOCTYPES.has(docTypeId)) return null;
  const dataSchema = buildDataSchemaForDoctype(docTypeId);
  if (!dataSchema) return null;
  const hasConcreteRanges = entriesHaveConcreteRanges(isPDF, entries);
  const properties = {
    id: { type: "STRING", enum: [docTypeId] },
    data: dataSchema,
    docdate: { type: "STRING", nullable: true },
    partId: { type: "STRING", enum: ["front", "back"], nullable: true }
  };
  const required = ["id", "data"];
  if (isPDF) {
    properties.start = { type: "INTEGER", minimum: 1 };
    properties.end = { type: "INTEGER", minimum: 1 };
    if (hasConcreteRanges) required.push("start", "end");
  }
  return {
    type: "OBJECT",
    properties: {
      documents: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties,
          required
        }
      }
    },
    required: ["documents"]
  };
}
function entriesHaveConcreteRanges(isPDF, entries) {
  return isPDF && entries.length > 0 && entries.every(
    (e) => Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 1 && e.end >= e.start
  );
}
function getSchemaVersionPayload() {
  const doctypeIds = getDoctypes().map((dt) => dt.id);
  const extractSchemas = [...DATA_SCHEMA_DOCTYPES].sort().map((id) => ({
    id,
    image: buildExtractResponseSchema(id, false, [{}]),
    pdfRanged: buildExtractResponseSchema(id, true, [{ start: 1, end: 1 }]),
    pdfRangeless: buildExtractResponseSchema(id, true, [{}])
  }));
  return {
    classifyImage: buildClassifyResponseSchema(doctypeIds, false),
    classifyPdf: buildClassifyResponseSchema(doctypeIds, true),
    classifyImageShapeOnly: buildShapeOnlyClassifyResponseSchema(doctypeIds, false),
    classifyPdfShapeOnly: buildShapeOnlyClassifyResponseSchema(doctypeIds, true),
    extractSchemas
  };
}
function isPlainRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isMergeGap(value) {
  if (value === void 0 || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainRecord(value)) return Object.keys(value).length === 0;
  return false;
}
function mergeFieldValue(pass1, pass2) {
  if (isPlainRecord(pass1) && isPlainRecord(pass2)) {
    return mergePassData(pass1, pass2);
  }
  return isMergeGap(pass2) ? pass1 : pass2;
}
function mergePassData(pass1, pass2) {
  const first = isPlainRecord(pass1) ? pass1 : {};
  const second = isPlainRecord(pass2) ? pass2 : {};
  const merged = { ...first };
  for (const key of Object.keys(second)) {
    merged[key] = mergeFieldValue(first[key], second[key]);
  }
  return merged;
}
async function classifyDocument(base64, mimetype, model, isPDF, doctypes, usageAccum, geminiModel) {
  const typeList = doctypes.map((dt) => {
    const base = `\u2022 ${dt.id}: ${dt.definition || dt.label}`;
    if (!dt.fieldDefs?.length) return base;
    const fields = JSON.stringify(dt.fieldDefs.map((f) => {
      const entry = { key: f.key, type: f.type };
      if (f.ai) entry.ai = f.ai;
      return entry;
    }));
    return `${base}
  fields: ${fields}`;
  }).join("\n");
  const inlineDataIds = doctypes.map((d) => d.id).filter((id) => DATA_SCHEMA_DOCTYPES.has(id));
  const inlineDataLine = inlineDataIds.length > 0 ? `Para los tipos { ${inlineDataIds.join(", ")} }, adem\xE1s del id/confidence/rango incluye "data" (objeto con los campos del esquema correspondiente \u2014 usa el "key" exacto de "fields" arriba) y "docdate" (formato YYYY-MM-DD; la fecha a la que CORRESPONDE la informaci\xF3n, NO la fecha de descarga). Para otros tipos, "data" y "docdate" son opcionales.` : "";
  const prompt = `Identifica los tipos de documento en este archivo chileno.
Si el archivo NO corresponde a ninguno de los tipos listados abajo, devuelve {"documents":[]}.
Devuelve JSON: {"documents":[{"id":"tipo-id","confidence":0.0-1.0${isPDF ? ',"start":1,"end":1' : ""},"partId":"front|back","data":{...},"docdate":"YYYY-MM-DD"}]}
${isPDF ? `"start"/"end": p\xE1ginas 1-indexed. Si un tipo aparece m\xFAltiples veces (ej: varias liquidaciones), devuelve uno por instancia con su rango de p\xE1ginas. P\xE1ginas que no correspondan a ning\xFAn tipo listado deben ignorarse.
Si una p\xE1gina contiene AMBAS caras de una c\xE9dula (frente y reverso), devuelve DOS elementos con la misma p\xE1gina y diferente partId.` : `Si la imagen contiene AMBAS caras de una c\xE9dula (frente y reverso apilados), devuelve DOS elementos. Para otro documento, devuelve uno solo.`}
"partId": solo para c\xE9dula-identidad. Frente tiene foto/RUT/nombre. Reverso tiene firma/huella/profesi\xF3n.
"confidence": 0.0-1.0, qu\xE9 tan seguro est\xE1s del tipo. 1.0 = totalmente seguro; 0.7 = duda menor; <0.5 = devuelve {"documents":[]}.
- Si no est\xE1s seguro del tipo, devuelve {"documents":[]}. Es mejor no clasificar que clasificar mal.
- Campos type:"num": devuelve n\xFAmero entero sin separador de miles. En Chile el punto es separador de miles (NO decimal): $558.376 = 558376, $1.923 = 1923, $95.032.491 = 95032491
- No inventes datos salvo campos con instrucci\xF3n "ai".
${inlineDataLine}
Tipos v\xE1lidos:
${typeList}`;
  const doctypeIds = doctypes.map((d) => d.id);
  const schema = buildClassifyResponseSchema(doctypeIds, isPDF);
  let vr;
  let requireConfidence = false;
  try {
    vr = await model2vision(model, mimetype, base64, prompt, geminiModel, schema);
  } catch (err) {
    if (!isGeminiInvalidArgumentError(err)) throw err;
    const shapeOnlySchema = buildShapeOnlyClassifyResponseSchema(doctypeIds, isPDF);
    vr = await model2vision(model, mimetype, base64, prompt, geminiModel, shapeOnlySchema);
    requireConfidence = true;
  }
  if (usageAccum) Object.assign(usageAccum, addUsage(usageAccum, vr.usage));
  const rawDocs = parseRawDocs(vr.text);
  return normalizeClassifyDocs(rawDocs, { requireConfidence, allowedIds: doctypeIds });
}
async function extractFields(base64, mimetype, model, isPDF, docTypeId, doctype, entries, usageAccum, geminiModel) {
  const fields = JSON.stringify(doctype.fieldDefs.map((f) => {
    const entry = { key: f.key, type: f.type };
    if (f.ai) entry.ai = f.ai;
    return entry;
  }));
  const isCedula = docTypeId === "cedula-identidad";
  const cedulaBbox = isCedula ? `
Si partId es "front", incluye "foto_bbox" en "data" con coordenadas (0-100%) de la foto: {x, y, width, height}. Incluye cabeza completa, cuello y hombros.` : "";
  const hasConcreteRanges = entriesHaveConcreteRanges(isPDF, entries);
  const pageHint = hasConcreteRanges ? `Documentos detectados en p\xE1ginas: ${entries.map((e) => e.partId ? `${e.start}-${e.end} (${e.partId})` : `${e.start}-${e.end}`).join(", ")}.` : "";
  const dateInstruction = doctype.dateHint ? `"docdate": ${doctype.dateHint}. Formato YYYY-MM-DD` : `"docdate": la fecha a la que CORRESPONDE la informaci\xF3n, NO cu\xE1ndo fue emitido. Para certificados sin per\xEDodo, usar fecha de emisi\xF3n. Formato YYYY-MM-DD`;
  const prompt = `Extrae los campos de "${doctype.label}" (id: "${docTypeId}").
${pageHint}
Devuelve JSON: {"documents":[{"id":"${docTypeId}","data":{...},"docdate":"YYYY-MM-DD"${hasConcreteRanges ? ',"start":N,"end":N' : ""}${isCedula ? ',"partId":"front|back"' : ""}}]}
Campos: ${fields}
${cedulaBbox}
- ${dateInstruction}
- Campos type:"num": devuelve n\xFAmero entero sin separador de miles. En Chile el punto es separador de miles (NO decimal): $558.376 = 558376, $1.923 = 1923, $95.032.491 = 95032491
- No inventes datos salvo campos con instrucci\xF3n "ai"
- Distingue entre CERTIFICADO (emitido) y FORMULARIO (para llenar)
- Solo JSON, sin markdown`;
  const schema = buildExtractResponseSchema(docTypeId, isPDF, entries);
  const vr = await model2vision(model, mimetype, base64, prompt, geminiModel, schema || void 0);
  if (usageAccum) Object.assign(usageAccum, addUsage(usageAccum, vr.usage));
  return parseRawDocs(vr.text);
}
async function Doc2Fields(buffer, mimetype, model = "gemini", forcedDoctypeId, options) {
  const isImage = mimetype.startsWith("image/");
  const isPDF = mimetype === "application/pdf";
  if (!isImage && !isPDF) throw new Error("Images and PDFs only");
  const { doctypes: fullDoctypes, mapById } = loadSchemas();
  const narrow = Array.isArray(options?.allowedDoctypeIds) && options.allowedDoctypeIds.length > 0;
  const doctypes = narrow ? fullDoctypes.filter((dt) => options.allowedDoctypeIds.includes(dt.id)) : fullDoctypes;
  const base64 = buffer.toString("base64");
  const aiModel = toAiModel(model);
  const usage = {};
  const classifyGeminiModel = options?.geminiModels?.classify;
  const extractGeminiModel = options?.geminiModels?.extract;
  let allRawDocs;
  if (forcedDoctypeId) {
    const doctype = mapById[forcedDoctypeId];
    if (!doctype) return { documents: [] };
    allRawDocs = await extractFields(base64, mimetype, aiModel, isPDF, forcedDoctypeId, doctype, [{}], usage, extractGeminiModel);
  } else if (isImage) {
    const classified = await classifyDocument(base64, mimetype, aiModel, false, doctypes, usage, classifyGeminiModel);
    if (classified.length === 0) return { documents: [] };
    const byType = /* @__PURE__ */ new Map();
    for (const c of classified) {
      const list = byType.get(c.id) || [];
      list.push({ partId: c.partId, confidence: c.confidence, data: c.data, docdate: c.docdate });
      byType.set(c.id, list);
    }
    const extractionResults = await Promise.all(
      Array.from(byType.entries()).map(async ([typeId, entries]) => {
        const dt = mapById[typeId];
        if (!dt) return { typeId, results: [] };
        const results = await extractFields(
          base64,
          mimetype,
          aiModel,
          false,
          typeId,
          dt,
          entries.map((e) => ({ partId: e.partId })),
          usage,
          extractGeminiModel
        );
        return { typeId, results };
      })
    );
    const extractedByType = /* @__PURE__ */ new Map();
    for (const { typeId, results } of extractionResults) extractedByType.set(typeId, results);
    allRawDocs = [];
    for (const [typeId, classEntries] of byType) {
      if (!mapById[typeId]) continue;
      const ext = extractedByType.get(typeId) || [];
      for (let i = 0; i < classEntries.length; i++) {
        const cls = classEntries[i];
        const e = i < ext.length ? normalizeDoc(ext[i]) : null;
        allRawDocs.push({
          id: typeId,
          data: mergePassData(cls.data, e?.data),
          docdate: e?.docdate || cls.docdate || null,
          ...cls.confidence !== void 0 ? { confidence: cls.confidence } : {},
          ...cls.partId ? { partId: cls.partId } : {}
        });
      }
    }
  } else {
    let classified;
    let totalPages = 0;
    let pdfDoc = null;
    let pageBase64s = [];
    try {
      pdfDoc = await pdfLib.PDFDocument.load(buffer);
      totalPages = pdfDoc.getPageCount();
      if (totalPages > 1) {
        for (let p = 1; p <= totalPages; p++) {
          const out = await pdfLib.PDFDocument.create();
          const [copied] = await out.copyPages(pdfDoc, [p - 1]);
          out.addPage(copied);
          pageBase64s.push(Buffer.from(await out.save()).toString("base64"));
        }
        const perPageClassifications = await Promise.all(
          pageBase64s.map(async (b64) => {
            const localUsage = {};
            const classified2 = await classifyDocument(b64, mimetype, aiModel, false, doctypes, localUsage, classifyGeminiModel);
            return { classified: classified2, localUsage };
          })
        );
        const perPage = [];
        perPageClassifications.forEach(({ classified: classified2, localUsage }, idx) => {
          Object.assign(usage, addUsage(usage, localUsage));
          for (const c of classified2) {
            perPage.push({ id: c.id, page: idx + 1, partId: c.partId, confidence: c.confidence, data: c.data, docdate: c.docdate });
          }
        });
        classified = [];
        for (let i = 0; i < perPage.length; i++) {
          const entry = perPage[i];
          if (entry.partId) {
            classified.push({ id: entry.id, start: entry.page, end: entry.page, partId: entry.partId, ...entry.confidence !== void 0 ? { confidence: entry.confidence } : {}, ...entry.data ? { data: entry.data } : {}, ...entry.docdate ? { docdate: entry.docdate } : {} });
            continue;
          }
          let end = entry.page;
          let minConf = entry.confidence;
          while (i + 1 < perPage.length && perPage[i + 1].id === entry.id && !perPage[i + 1].partId && perPage[i + 1].page === end + 1) {
            end = perPage[i + 1].page;
            const next = perPage[i + 1].confidence;
            if (next !== void 0) minConf = minConf === void 0 ? next : Math.min(minConf, next);
            i++;
          }
          classified.push({ id: entry.id, start: entry.page, end, ...minConf !== void 0 ? { confidence: minConf } : {}, ...entry.data ? { data: entry.data } : {}, ...entry.docdate ? { docdate: entry.docdate } : {} });
        }
      } else {
        classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes, usage, classifyGeminiModel);
      }
    } catch {
      classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes, usage, classifyGeminiModel);
    }
    if (classified.length === 0) {
      return { documents: [] };
    }
    {
      const cedulaEntries = classified.filter((c) => c.id === "cedula-identidad");
      for (const entry of cedulaEntries) {
        if (!entry.partId) entry.partId = "front";
        if (entry.partId === "front") {
          const hasBack = cedulaEntries.some(
            (c) => c.partId === "back" && c.start === entry.start && c.end === entry.end
          );
          if (!hasBack) {
            classified.push({
              id: "cedula-identidad",
              start: entry.start,
              end: entry.end,
              partId: "back"
            });
          }
        }
      }
    }
    {
      const expanded = [];
      for (const entry of classified) {
        const dt = mapById[entry.id];
        const span = entry.start != null && entry.end != null ? entry.end - entry.start + 1 : 1;
        const isCedulaEntry = entry.id === "cedula-identidad" && !!entry.partId;
        const isAnnual = dt?.freq === "annual";
        if (dt && dt.count > 1 && span > 1 && !isCedulaEntry && !isAnnual) {
          for (let p = entry.start; p <= entry.end; p++) {
            expanded.push({ ...entry, start: p, end: p });
          }
        } else {
          expanded.push(entry);
        }
      }
      classified = expanded;
    }
    {
      const containerEntries = classified.filter((c) => mapById[c.id]?.contains?.length);
      const hasValidRange = (entry, minPage, maxPage) => {
        const start = entry.start;
        const end = entry.end;
        if (typeof start !== "number" || typeof end !== "number") return false;
        if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
        return start >= minPage && end <= maxPage && start <= end;
      };
      for (const container of containerEntries) {
        const containerDt = mapById[container.id];
        if (!containerDt?.contains?.length) continue;
        const containedIds = new Set(containerDt.contains);
        const containerStart = Number.isInteger(container.start) ? container.start : 1;
        const containerEnd = Number.isInteger(container.end) ? container.end : totalPages;
        if (containerStart < 1 || containerEnd > totalPages || containerStart > containerEnd) continue;
        const hasSubDocs = classified.some(
          (c) => containedIds.has(c.id) && hasValidRange(c, containerStart, containerEnd)
        );
        if (!hasSubDocs && totalPages > 1) {
          const subDoctypes = doctypes.filter((dt) => containedIds.has(dt.id));
          if (subDoctypes.length === 0) continue;
          if (pageBase64s.length === totalPages) {
            const pages = [];
            for (let p = containerStart; p <= containerEnd; p++) pages.push(p);
            const subPerPage = await Promise.all(
              pages.map(async (page) => {
                const localUsage = {};
                const c = await classifyDocument(pageBase64s[page - 1], mimetype, aiModel, false, subDoctypes, localUsage, classifyGeminiModel);
                return { c, localUsage, page };
              })
            );
            const subPerPageFlat = [];
            subPerPage.forEach(({ c, localUsage, page }) => {
              Object.assign(usage, addUsage(usage, localUsage));
              for (const entry of c) {
                subPerPageFlat.push({ id: entry.id, page, partId: entry.partId, confidence: entry.confidence, data: entry.data, docdate: entry.docdate });
              }
            });
            for (let i = 0; i < subPerPageFlat.length; i++) {
              const entry = subPerPageFlat[i];
              if (entry.partId) {
                classified.push({ id: entry.id, start: entry.page, end: entry.page, partId: entry.partId, ...entry.confidence !== void 0 ? { confidence: entry.confidence } : {}, ...entry.data ? { data: entry.data } : {}, ...entry.docdate ? { docdate: entry.docdate } : {} });
                continue;
              }
              let end = entry.page;
              let minConf = entry.confidence;
              while (i + 1 < subPerPageFlat.length && subPerPageFlat[i + 1].id === entry.id && !subPerPageFlat[i + 1].partId && subPerPageFlat[i + 1].page === end + 1) {
                end = subPerPageFlat[i + 1].page;
                const next = subPerPageFlat[i + 1].confidence;
                if (next !== void 0) minConf = minConf === void 0 ? next : Math.min(minConf, next);
                i++;
              }
              classified.push({ id: entry.id, start: entry.page, end, ...minConf !== void 0 ? { confidence: minConf } : {}, ...entry.data ? { data: entry.data } : {}, ...entry.docdate ? { docdate: entry.docdate } : {} });
            }
          } else {
            const subClassified = await classifyDocument(
              base64,
              mimetype,
              aiModel,
              isPDF,
              subDoctypes,
              usage,
              classifyGeminiModel
            );
            for (const sub of subClassified) {
              if (!containedIds.has(sub.id)) continue;
              if (!hasValidRange(sub, containerStart, containerEnd)) continue;
              classified.push(sub);
            }
          }
        }
      }
    }
    const byType = /* @__PURE__ */ new Map();
    for (const c of classified) {
      const existing = byType.get(c.id) || [];
      existing.push({ start: c.start, end: c.end, partId: c.partId, confidence: c.confidence, data: c.data, docdate: c.docdate });
      byType.set(c.id, existing);
    }
    const MAX_PER_BATCH = 8;
    const extractionPromises = [];
    for (const [docTypeId, entries] of byType) {
      const doctype = mapById[docTypeId];
      if (!doctype) continue;
      let extractBase64 = base64;
      let adjustedEntries = entries;
      if (pdfDoc && totalPages > 1 && entries.every((e) => e.start != null && e.end != null)) {
        const allPages = /* @__PURE__ */ new Set();
        for (const e of entries) {
          for (let p = e.start; p <= e.end; p++) allPages.add(p);
        }
        if (allPages.size > 0 && allPages.size < totalPages) {
          try {
            const sortedPages = [...allPages].sort((a, b) => a - b);
            const out = await pdfLib.PDFDocument.create();
            const copied = await out.copyPages(pdfDoc, sortedPages.map((p) => p - 1));
            copied.forEach((p) => out.addPage(p));
            extractBase64 = Buffer.from(await out.save()).toString("base64");
            const pageMap = new Map(sortedPages.map((orig, idx) => [orig, idx + 1]));
            adjustedEntries = entries.map((e) => ({
              ...e,
              start: pageMap.get(e.start),
              end: pageMap.get(e.end)
            }));
          } catch {
          }
        }
      }
      if (adjustedEntries.length > MAX_PER_BATCH) {
        for (let i = 0; i < adjustedEntries.length; i += MAX_PER_BATCH) {
          extractionPromises.push(
            extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries.slice(i, i + MAX_PER_BATCH), usage, extractGeminiModel)
          );
        }
      } else {
        extractionPromises.push(
          extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries, usage, extractGeminiModel)
        );
      }
    }
    const extractionResults = await Promise.all(extractionPromises);
    {
      const extractedByType = /* @__PURE__ */ new Map();
      for (const raw of extractionResults.flat()) {
        const n = normalizeDoc(raw);
        if (!n.id) continue;
        if (!extractedByType.has(n.id)) extractedByType.set(n.id, []);
        extractedByType.get(n.id).push(n);
      }
      allRawDocs = [];
      for (const [typeId, classEntries] of byType) {
        if (!mapById[typeId]) continue;
        const sortedClass = [...classEntries].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        const sortedExtracted = (extractedByType.get(typeId) || []).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        if (sortedExtracted.length > sortedClass.length && sortedClass.length > 0) {
          const classRange = {
            start: Math.min(...sortedClass.map((c) => c.start ?? 0)),
            end: Math.max(...sortedClass.map((c) => c.end ?? 0))
          };
          const classConfidences = sortedClass.map((c) => c.confidence).filter((v) => v !== void 0);
          const minConf = classConfidences.length > 0 ? Math.min(...classConfidences) : void 0;
          for (const ext of sortedExtracted) {
            const start = ext.start ?? classRange.start;
            const end = ext.end ?? start;
            allRawDocs.push({
              id: typeId,
              data: ext.data || {},
              docdate: ext.docdate || null,
              ...minConf !== void 0 ? { confidence: minConf } : {},
              start,
              end
            });
          }
        } else {
          for (let i = 0; i < sortedClass.length; i++) {
            const cls = sortedClass[i];
            const ext = i < sortedExtracted.length ? sortedExtracted[i] : null;
            const data = mergePassData(cls.data, ext?.data);
            const docdate = ext?.docdate || cls.docdate || null;
            allRawDocs.push({
              id: typeId,
              data,
              docdate,
              ...cls.confidence !== void 0 ? { confidence: cls.confidence } : {},
              start: cls.start,
              end: cls.end,
              ...cls.partId ? { partId: cls.partId } : {}
            });
          }
        }
      }
    }
  }
  const skipFace = options?.skipFace === true;
  const documents = await Promise.all(allRawDocs.map(async (d) => {
    const normalized = normalizeDoc(d);
    const { id, data, start, end, confidence } = normalized;
    let partId = normalized.partId;
    let docdate = normalized.docdate;
    if (id === "cedula-identidad" && partId === "front" && !skipFace) {
      let imageBuffer = null;
      if (isImage) {
        imageBuffer = buffer;
      } else if (isPDF && typeof start === "number") {
        imageBuffer = await extractPdfPageAsImage(buffer, start);
      }
      if (imageBuffer) {
        const result = await extractFace(imageBuffer);
        if (result) {
          data.foto_base64 = result.face;
        } else {
          partId = "back";
        }
      }
      delete data.foto_bbox;
    }
    if (id === "cedula-identidad" && partId === "back") {
      delete data.fecha_nacimiento;
      delete data.fecha_emision;
      delete data.fecha_vencimiento;
      delete data.numero_documento;
      delete data.foto_bbox;
      docdate = null;
    }
    return {
      doc_type_id: id,
      label: id ? mapById?.[id]?.label || null : null,
      data,
      docdate,
      ...confidence !== void 0 ? { confidence } : {},
      ...Number.isFinite(start) ? { start } : {},
      ...Number.isFinite(end) ? { end } : {},
      ...partId ? { partId } : {}
    };
  }));
  for (const front of documents) {
    if (front.doc_type_id !== "cedula-identidad" || front.partId !== "front") continue;
    const frontData = front.data;
    const back = documents.find(
      (d) => d.doc_type_id === "cedula-identidad" && d.partId === "back" && d.start === front.start && d.end === front.end
    );
    if (!back) continue;
    const backData = back.data;
    for (const key of ["lugar_nacimiento", "profesion"]) {
      if (frontData[key] && !backData[key]) {
        backData[key] = frontData[key];
        delete frontData[key];
      }
    }
    if (!back.docdate && front.docdate) back.docdate = front.docdate;
  }
  const hasUsage = usage.promptTokenCount || usage.candidatesTokenCount;
  return { documents, ...hasUsage ? { usage } : {} };
}
var ASPECT_RATIO_THRESHOLD = 1.2;
function findBestSplit(data, info, isGapRow, isContentRow) {
  const MIN_GAP_ROWS = Math.max(10, Math.round(info.height * 0.02));
  const gaps = [];
  let gs = -1;
  for (let y = 0; y < info.height; y++) {
    if (isGapRow(y)) {
      if (gs < 0) gs = y;
    } else if (gs >= 0) {
      const size = y - gs;
      if (size >= MIN_GAP_ROWS) gaps.push({ start: gs, end: y - 1, size });
      gs = -1;
    }
  }
  if (gaps.length === 0) return null;
  let contentStart = -1, contentEnd = -1;
  for (let y = 0; y < info.height; y++) if (isContentRow(y)) {
    contentStart = y;
    break;
  }
  for (let y = info.height - 1; y >= 0; y--) if (isContentRow(y)) {
    contentEnd = y;
    break;
  }
  if (contentStart < 0 || contentEnd < 0) return null;
  const interior = gaps.filter((g) => g.start > contentStart && g.end < contentEnd);
  if (interior.length === 0) return null;
  const mainGap = interior.reduce((best, g) => {
    const count = (from, to) => {
      let n = 0;
      for (let y = from; y <= to; y++) if (isContentRow(y)) n++;
      return n;
    };
    const gImbalance = Math.abs(count(contentStart, g.start - 1) - count(g.end + 1, contentEnd));
    const bestImbalance = Math.abs(count(contentStart, best.start - 1) - count(best.end + 1, contentEnd));
    return gImbalance < bestImbalance ? g : best;
  }, interior[0]);
  let frontTop = -1;
  for (let y = 0; y < mainGap.start; y++) if (isContentRow(y)) {
    frontTop = y;
    break;
  }
  if (frontTop < 0) return null;
  let frontBottom = mainGap.start - 1;
  for (let y = frontBottom; y > frontTop; y--) if (isContentRow(y)) {
    frontBottom = y;
    break;
  }
  let backTop = -1;
  for (let y = mainGap.end + 1; y < info.height; y++) if (isContentRow(y)) {
    backTop = y;
    break;
  }
  if (backTop < 0) return null;
  let backBottom = info.height - 1;
  for (let y = info.height - 1; y > backTop; y--) if (isContentRow(y)) {
    backBottom = y;
    break;
  }
  const minH = Math.round(info.height * 0.1);
  if (frontBottom - frontTop < minH || backBottom - backTop < minH) return null;
  function getColBounds(startRow, endRow) {
    let left = info.width, right = 0;
    for (let x = 0; x < info.width; x++) {
      for (let y = startRow; y <= endRow; y++) {
        if (data[y * info.width + x] < 200) {
          if (x < left) left = x;
          if (x > right) right = x;
          break;
        }
      }
    }
    if (right <= left) return { left: 0, right: info.width - 1 };
    return { left, right };
  }
  const fc = getColBounds(frontTop, frontBottom);
  const bc = getColBounds(backTop, backBottom);
  const PAD = 10;
  return {
    front: {
      left: Math.max(0, fc.left - PAD),
      top: Math.max(0, frontTop - PAD),
      width: Math.min(fc.right - fc.left + PAD * 2, info.width - Math.max(0, fc.left - PAD)),
      height: Math.min(frontBottom - frontTop + PAD * 2, info.height - Math.max(0, frontTop - PAD))
    },
    back: {
      left: Math.max(0, bc.left - PAD),
      top: Math.max(0, backTop - PAD),
      width: Math.min(bc.right - bc.left + PAD * 2, info.width - Math.max(0, bc.left - PAD)),
      height: Math.min(backBottom - backTop + PAD * 2, info.height - Math.max(0, backTop - PAD))
    }
  };
}
async function findCardRegions(imageBuffer) {
  const { data, info } = await sharp2__default.default(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rowDarkness = [];
  const rowVariance = [];
  for (let y = 0; y < info.height; y++) {
    let darkPixels = 0, sum = 0;
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x];
      if (v < 200) darkPixels++;
      sum += v;
    }
    const mean = sum / info.width;
    let varSum = 0;
    for (let x = 0; x < info.width; x++) {
      const diff = data[y * info.width + x] - mean;
      varSum += diff * diff;
    }
    rowDarkness.push(darkPixels / info.width);
    rowVariance.push(varSum / info.width);
  }
  const DARK_ROW_THRESHOLD = 0.05;
  const brightnessResult = findBestSplit(
    data,
    info,
    (y) => rowDarkness[y] <= DARK_ROW_THRESHOLD,
    (y) => rowDarkness[y] > DARK_ROW_THRESHOLD
  );
  if (brightnessResult) return brightnessResult;
  const sorted = [...rowVariance].sort((a, b) => a - b);
  const medianVariance = sorted[Math.floor(sorted.length / 2)];
  const varianceThreshold = medianVariance * 0.15;
  return findBestSplit(
    data,
    info,
    (y) => rowVariance[y] <= varianceThreshold,
    (y) => rowVariance[y] > varianceThreshold
  );
}
async function detectAndSplitCompositeCedula(imageBuffer, mimetype, model = "gemini") {
  const metadata = await sharp2__default.default(imageBuffer).metadata();
  const imgWidth = metadata.width || 0;
  const imgHeight = metadata.height || 0;
  const aspectRatio = imgHeight / (imgWidth || 1);
  if (!(aspectRatio > ASPECT_RATIO_THRESHOLD && imgWidth > 0 && imgHeight > 0)) {
    return null;
  }
  const regions = await findCardRegions(imageBuffer).catch(() => null);
  let frontBuf;
  let backBuf;
  if (regions) {
    frontBuf = await sharp2__default.default(imageBuffer).extract(regions.front).toBuffer();
    backBuf = await sharp2__default.default(imageBuffer).extract(regions.back).toBuffer();
  } else {
    const halfHeight = Math.round(imgHeight / 2);
    frontBuf = await sharp2__default.default(imageBuffer).extract({ left: 0, top: 0, width: imgWidth, height: halfHeight }).toBuffer();
    backBuf = await sharp2__default.default(imageBuffer).extract({ left: 0, top: halfHeight, width: imgWidth, height: imgHeight - halfHeight }).toBuffer();
  }
  const frontOcr = await Doc2Fields(frontBuf, mimetype, model);
  const frontDoc = frontOcr?.documents?.[0];
  if (frontDoc?.doc_type_id !== "cedula-identidad") {
    return null;
  }
  const backOcr = await Doc2Fields(backBuf, mimetype, model, "cedula-identidad");
  const backDoc = backOcr?.documents?.[0];
  const rawBackData = backDoc?.data || {};
  const backData = {};
  if (rawBackData.lugar_nacimiento) backData.lugar_nacimiento = rawBackData.lugar_nacimiento;
  if (rawBackData.profesion) backData.profesion = rawBackData.profesion;
  return {
    parts: [
      {
        partId: "front",
        buffer: frontBuf,
        aiFields: JSON.stringify(frontDoc.data || {}),
        aiDate: frontDoc.docdate ? /* @__PURE__ */ new Date(`${frontDoc.docdate}T12:00:00`) : null,
        docdate: frontDoc.docdate || null
      },
      {
        partId: "back",
        buffer: backBuf,
        aiFields: JSON.stringify(backData),
        aiDate: backDoc?.docdate ? /* @__PURE__ */ new Date(`${backDoc.docdate}T12:00:00`) : null,
        docdate: backDoc?.docdate || frontDoc.docdate || null
      }
    ]
  };
}
var BBOX_PROMPT = `You are looking at a photograph or scan of a Chilean ID card (c\xE9dula de identidad). The image likely contains BOTH sides of the card \u2014 front and back \u2014 in a single image.

How to identify each side:
- FRONT: Has a passport-style PHOTO of a person on the left side, plus text fields: name (APELLIDOS/NOMBRES), RUT number, birth date, nationality, sex, issue/expiry dates, and a signature. The header reads "C\xC9DULA DE IDENTIDAD" and "REP\xDABLICA DE CHILE".
- BACK: Has a QR code (top-left), a fingerprint (right side), MRZ machine-readable lines at the bottom (starts with INCHL...), and text fields: birthplace (Naci\xF3 en), profession (Profesi\xF3n).

Common layouts: cards stacked vertically (front on top, back below), side by side, or at slight angles. There is usually a visible gap or background between the two cards.

Return the bounding box of EACH side as percentage coordinates (0\u2013100) of the full image:
{"front": {"x": N, "y": N, "width": N, "height": N}, "back": {"x": N, "y": N, "width": N, "height": N}}

Where x/y is the top-left corner of the card as a percentage of image width/height, and width/height is the card's size as a percentage of image dimensions.

Example for vertically stacked cards:
{"front": {"x": 2, "y": 1, "width": 96, "height": 46}, "back": {"x": 2, "y": 52, "width": 96, "height": 46}}

If you can only see ONE side of the card, return:
{"front": null, "back": null}

Return ONLY valid JSON.`;
async function findCardRegionsWithAI(imageBuffer, mimetype, model) {
  const base64 = imageBuffer.toString("base64");
  const vr = await model2vision(model, mimetype, base64, BBOX_PROMPT, "gemini-2.5-flash");
  if (!vr.text) return null;
  const jsonMatch = vr.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.front || !parsed.back) return null;
  const isValidBox = (b) => b && typeof b.x === "number" && typeof b.y === "number" && typeof b.width === "number" && typeof b.height === "number" && b.width > 0 && b.height > 0 && b.x >= -5 && b.y >= -5 && b.x + b.width <= 110 && b.y + b.height <= 110;
  if (!isValidBox(parsed.front) || !isValidBox(parsed.back)) return null;
  return { front: parsed.front, back: parsed.back };
}
async function cropRegion(buffer, bbox, imgW, imgH) {
  const PAD = 2;
  const px = Math.max(0, bbox.x - PAD);
  const py = Math.max(0, bbox.y - PAD);
  const pw = Math.min(bbox.width + PAD * 2, 100 - px);
  const ph = Math.min(bbox.height + PAD * 2, 100 - py);
  const left = Math.max(0, Math.round(px / 100 * imgW));
  const top = Math.max(0, Math.round(py / 100 * imgH));
  const width = Math.min(Math.round(pw / 100 * imgW), imgW - left);
  const height = Math.min(Math.round(ph / 100 * imgH), imgH - top);
  if (width <= 10 || height <= 10) return null;
  return sharp2__default.default(buffer).extract({ left, top, width, height }).toBuffer();
}
async function detectAndSplitCompositeCedulaV3(imageBuffer, mimetype, model = "gemini") {
  const metadata = await sharp2__default.default(imageBuffer).metadata();
  const imgW = metadata.width || 0;
  const imgH = metadata.height || 0;
  if (!imgW || !imgH) return null;
  const aiModel = toAiModel(model);
  let regions;
  try {
    regions = await findCardRegionsWithAI(imageBuffer, mimetype, aiModel);
  } catch (err) {
    if (err?.status === 429) throw err;
    getLogger().error(err, { module: "cedula-split-v3", action: "findRegions" });
    return null;
  }
  if (!regions) return null;
  let frontBuf = await cropRegion(imageBuffer, regions.front, imgW, imgH);
  let backBuf = await cropRegion(imageBuffer, regions.back, imgW, imgH);
  if (!frontBuf || !backBuf) return null;
  const trimOpts = { background: "#FFFFFF", threshold: 80 };
  try {
    frontBuf = await sharp2__default.default(frontBuf).trim(trimOpts).toBuffer();
  } catch {
  }
  try {
    backBuf = await sharp2__default.default(backBuf).trim(trimOpts).toBuffer();
  } catch {
  }
  const frontOcr = await Doc2Fields(frontBuf, mimetype, model, void 0, { skipFace: true });
  const frontDoc = frontOcr?.documents?.[0];
  if (frontDoc?.doc_type_id !== "cedula-identidad") return null;
  const frontData = frontDoc.data || {};
  delete frontData.foto_bbox;
  const faceResult = await extractFace(frontBuf);
  if (faceResult) frontData.foto_base64 = faceResult.face;
  const backOcr = await Doc2Fields(backBuf, mimetype, model, "cedula-identidad");
  const backDoc = backOcr?.documents?.[0];
  const rawBackData = backDoc?.data || {};
  const backData = {};
  if (rawBackData.lugar_nacimiento) backData.lugar_nacimiento = rawBackData.lugar_nacimiento;
  if (rawBackData.profesion) backData.profesion = rawBackData.profesion;
  return {
    parts: [
      {
        partId: "front",
        buffer: frontBuf,
        aiFields: JSON.stringify(frontData),
        aiDate: frontDoc.docdate ? /* @__PURE__ */ new Date(`${frontDoc.docdate}T12:00:00`) : null,
        docdate: frontDoc.docdate || null
      },
      {
        partId: "back",
        buffer: backBuf,
        aiFields: JSON.stringify(backData),
        aiDate: backDoc?.docdate ? /* @__PURE__ */ new Date(`${backDoc.docdate}T12:00:00`) : null,
        docdate: backDoc?.docdate || frontDoc.docdate || null
      }
    ]
  };
}

// src/utils.ts
function safeJsonParse(json, context) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (error) {
    getLogger().error(error, {
      ...context,
      action: context?.action || "json_parse",
      jsonPreview: json.slice(0, 200)
    });
    return null;
  }
}

// src/multipart.ts
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

// src/cedulamerge.ts
var CEDULA_FRONT_FIELDS = ["rut", "nombres", "apellidos", "fecha_nacimiento", "nacionalidad", "foto_base64"];
var CEDULA_BACK_FIELDS = ["profesion", "lugar_nacimiento"];
var CEDULA_FIELDS = [...CEDULA_FRONT_FIELDS, ...CEDULA_BACK_FIELDS];
var isFormattedRut = (v) => typeof v === "string" && /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test(v);
function mergeCedulaFiles(files, logAction = "parse_cedula") {
  const merged = {};
  for (const f of files) {
    if (!f.ai_fields) continue;
    const parsed = typeof f.ai_fields === "string" ? safeJsonParse(f.ai_fields, { module: "situation", action: logAction }) : f.ai_fields;
    const d = parsed?.data || parsed || {};
    const partId = f.filename ? getPartIdFromFilename(f.filename) : null;
    const allow = (field) => !partId || partId === "front" && CEDULA_FRONT_FIELDS.includes(field) || partId === "back" && CEDULA_BACK_FIELDS.includes(field);
    for (const field of CEDULA_FIELDS) {
      if (!allow(field) || !d[field]) continue;
      if (field === "rut") {
        if (!merged.rut || !isFormattedRut(merged.rut) && isFormattedRut(d.rut)) merged.rut = d.rut;
      } else if (!merged[field]) {
        merged[field] = d[field];
      }
    }
  }
  return {
    nombres_apellidos: [merged.nombres, merged.apellidos].filter(Boolean).join(" "),
    cedula_identidad: merged.rut || "",
    fecha_nacimiento: merged.fecha_nacimiento || "",
    nacionalidad: merged.nacionalidad || "",
    profesion: merged.profesion || "",
    lugar_nacimiento: merged.lugar_nacimiento || "",
    foto_base64: merged.foto_base64 || null
  };
}

exports.Doc2Fields = Doc2Fields;
exports.buildCacheKey = buildCacheKey;
exports.buildClassifyResponseSchema = buildClassifyResponseSchema;
exports.buildDataSchemaForDoctype = buildDataSchemaForDoctype;
exports.buildExtractResponseSchema = buildExtractResponseSchema;
exports.buildShapeOnlyClassifyResponseSchema = buildShapeOnlyClassifyResponseSchema;
exports.configure = configure;
exports.detectAndSplitCompositeCedula = detectAndSplitCompositeCedula;
exports.detectAndSplitCompositeCedulaV3 = detectAndSplitCompositeCedulaV3;
exports.detectCedulaSide = detectCedulaSide;
exports.extractFace = extractFace;
exports.extractPdfPageAsImage = extractPdfPageAsImage;
exports.getPromptVersion = getPromptVersion;
exports.mergeCedulaFiles = mergeCedulaFiles;
exports.queryGrounded = queryGrounded;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map