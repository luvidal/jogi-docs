'use strict';

var smartcrop = require('smartcrop-sharp');
var sharp3 = require('sharp');
var pdfLib = require('pdf-lib');
var crypto = require('crypto');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var smartcrop__default = /*#__PURE__*/_interopDefault(smartcrop);
var sharp3__default = /*#__PURE__*/_interopDefault(sharp3);

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
function configure(options) {
  if (options.logger) logger = options.logger;
}
function getLogger() {
  return logger;
}
var logger;
var init_config = __esm({
  "src/config.ts"() {
    logger = {
      error: (err, ctx) => console.error("[docprocessor]", err, ctx),
      warn: (msg, ctx) => console.warn("[docprocessor]", msg, ctx)
    };
  }
});

// src/ai.ts
var anthropicClient, openaiClient, geminiClient, getAnthropic, getOpenAI, getGemini, strict, stripFences, geminiText, isRateLimitError, delay, model2vision;
var init_ai = __esm({
  "src/ai.ts"() {
    anthropicClient = null;
    openaiClient = null;
    geminiClient = null;
    getAnthropic = async () => {
      if (!anthropicClient) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
      }
      return anthropicClient;
    };
    getOpenAI = async () => {
      if (!openaiClient) {
        const { default: OpenAI } = await import('openai');
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      }
      return openaiClient;
    };
    getGemini = async () => {
      if (!geminiClient) {
        const { GoogleGenAI } = await import('@google/genai');
        geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      }
      return geminiClient;
    };
    strict = "Devuelve EXCLUSIVAMENTE JSON v\xE1lido, sin markdown, sin texto adicional";
    stripFences = (txt) => txt.replace(/```json|```/g, "").trim();
    geminiText = (r) => r?.text || r?.candidates?.[0]?.content?.parts?.map?.((p) => p?.text || "").join?.("") || "";
    isRateLimitError = (err) => {
      if (!err) return false;
      const msg = err.message?.toLowerCase?.() || "";
      const status = err.status || err.statusCode || err.code;
      return status === 429 || status === "429" || status === 503 || status === "503" || msg.includes("429") || msg.includes("503") || msg.includes("rate") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("unavailable");
    };
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    model2vision = async (model, mimetype, base64, prompt) => {
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
        return stripFences(txt);
      }
      if (model === "ANTHROPIC" && process.env.ANTHROPIC_API_KEY) {
        const anthropic = await getAnthropic();
        const visionContent = [
          { type: "text", text: content },
          mimetype === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } : { type: "image", source: { type: "base64", media_type: mimetype, data: base64 } }
        ];
        const r = await anthropic.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 2048, temperature: 0, messages: [{ role: "user", content: visionContent }] });
        const block = r.content?.find((b) => b.type === "text");
        const txt = block?.text?.trim() || "";
        return stripFences(txt);
      }
      if (model === "GEMINI" && process.env.GEMINI_API_KEY) {
        const gemini = await getGemini();
        const maxRetries = 2;
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const r = await gemini.models.generateContent({
              model: "gemini-2.0-flash",
              contents: {
                parts: [
                  { text: content },
                  { inlineData: { mimeType: mimetype, data: base64 } }
                ]
              },
              config: {
                temperature: 0,
                maxOutputTokens: 8192,
                // Allow longer responses for multi-document PDFs
                responseMimeType: "application/json"
              }
            });
            return stripFences(geminiText(r));
          } catch (err) {
            lastError = err;
            if (isRateLimitError(err) && attempt < maxRetries) {
              await delay(1e3 * (attempt + 1));
              continue;
            }
            break;
          }
        }
        if (isRateLimitError(lastError) && process.env.ANTHROPIC_API_KEY) {
          console.warn("Gemini rate limited, falling back to Anthropic");
          const anthropic = await getAnthropic();
          const visionContent = [
            { type: "text", text: content },
            mimetype === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } : { type: "image", source: { type: "base64", media_type: mimetype, data: base64 } }
          ];
          const r = await anthropic.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 2048, temperature: 0, messages: [{ role: "user", content: visionContent }] });
          const block = r.content?.find((b) => b.type === "text");
          const txt = block?.text?.trim() || "";
          return stripFences(txt);
        }
        if (lastError) throw lastError;
      }
      return "";
    };
  }
});

// src/doctypes.json
var doctypes_default;
var init_doctypes = __esm({
  "src/doctypes.json"() {
    doctypes_default = {
      "carton-ds1": {
        label: "Cart\xF3n DS1",
        source: "MINVU",
        category: "personal",
        definition: "Cart\xF3n de beneficio social seg\xFAn Decreto Supremo 1.",
        fields: [
          {
            key: "beneficiario",
            type: "string",
            internal: true
          },
          {
            key: "estado_civil",
            type: "string",
            internal: true
          },
          {
            key: "monto_subsidio",
            type: "num",
            internal: true
          },
          {
            key: "formula_calculo",
            type: "string",
            internal: true
          }
        ]
      },
      "cedula-identidad": {
        label: "C\xE9dula de Identidad",
        shortLabel: "Carnet",
        source: "Registro Civil",
        category: "personal",
        freq: "once",
        count: 1,
        maxAge: 1825,
        parts: [
          "Frente",
          "Rev\xE9s"
        ],
        definition: "Documento nacional de identificaci\xF3n chileno emitido por el Servicio de Registro Civil e Identificaci\xF3n.",
        fields: [
          {
            key: "rut",
            type: "string"
          },
          {
            key: "nombres",
            type: "string"
          },
          {
            key: "apellidos",
            type: "string"
          },
          {
            key: "nacionalidad",
            type: "string"
          },
          {
            key: "sexo",
            type: "string",
            internal: true
          },
          {
            key: "fecha_nacimiento",
            type: "date"
          },
          {
            key: "numero_documento",
            type: "string",
            internal: true
          },
          {
            key: "fecha_emision",
            type: "date",
            internal: true
          },
          {
            key: "fecha_vencimiento",
            type: "date",
            internal: true
          },
          {
            key: "lugar_nacimiento",
            type: "string",
            internal: true
          },
          {
            key: "profesion",
            type: "string",
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Toma una foto clara de tu c\xE9dula de identidad por ambos lados",
            "Aseg\xFArate que se vean todos los datos sin reflejos",
            "Sube el <b>frente</b> y el <b>rev\xE9s</b> por separado"
          ],
          tips: [
            "Usa buena iluminaci\xF3n para evitar sombras",
            "Coloca la c\xE9dula sobre un fondo oscuro para mejor contraste"
          ]
        }
      },
      "cert-nacimiento-hijo": {
        label: "Cert. de Nacimiento (Hijo)",
        shortLabel: "Nacimiento",
        source: "Registro Civil",
        category: "personal",
        maxAge: 180,
        definition: "Certificado oficial emitido por el Registro Civil que acredita el nacimiento de una persona.",
        fields: [
          {
            key: "folio",
            type: "string",
            internal: true
          },
          {
            key: "codigo_verificacion",
            type: "string",
            internal: true
          },
          {
            key: "circunscripcion",
            type: "string",
            internal: true
          },
          {
            key: "numero_inscripcion",
            type: "string",
            internal: true
          },
          {
            key: "a\xF1o_registro",
            type: "string",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "fecha_nacimiento",
            type: "date",
            internal: true
          },
          {
            key: "hora_nacimiento",
            type: "time",
            internal: true
          },
          {
            key: "sexo",
            type: "string",
            internal: true
          },
          {
            key: "padre.nombre",
            type: "string"
          },
          {
            key: "padre.rut",
            type: "string"
          },
          {
            key: "madre.nombre",
            type: "string"
          },
          {
            key: "madre.rut",
            type: "string"
          },
          {
            key: "fecha_emision",
            type: "date",
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Ingresa a <a href='https://www.registrocivil.cl' target='_blank' rel='noopener'>www.registrocivil.cl</a>",
            "Haz clic en <b>Obtener Certificados</b>",
            "Selecciona <b>Certificado de Nacimiento</b>",
            "Inicia sesi\xF3n con tu Clave\xDAnica",
            "Descarga el certificado en formato PDF"
          ],
          tips: [
            "El certificado tiene validez de 60 d\xEDas",
            "Puedes obtener hasta 3 certificados gratis por a\xF1o"
          ]
        }
      },
      "certificado-antiguedad": {
        label: "Certificado Antig\xFCedad Laboral",
        shortLabel: "Antig\xFCedad",
        source: "Empleador",
        category: "personal",
        freq: "once",
        count: 1,
        maxAge: 30,
        definition: "Certificado que acredita la antig\xFCedad laboral de un trabajador. Emitido por el empleador, instituci\xF3n (Ej\xE9rcito, Carabineros, etc.) u organismo p\xFAblico. Indica fecha de ingreso, cargo y/o tiempo de servicio. Puede incluir remuneraci\xF3n.",
        fields: [
          {
            key: "empleador",
            type: "string"
          },
          {
            key: "rut_empleador",
            type: "string",
            internal: true
          },
          {
            key: "empleado",
            type: "string",
            internal: true
          },
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "cargo",
            type: "string",
            ai: "Cargo o funci\xF3n del trabajador. En instituciones militares puede aparecer como rango/grado antes del nombre (ej: CAP.=Capit\xE1n, SGT.=Sargento, TTE.=Teniente). Extrae el cargo completo."
          },
          {
            key: "fecha_ingreso",
            type: "date"
          },
          {
            key: "antiguedad",
            type: "string"
          },
          {
            key: "renta",
            type: "num",
            ai: "Extrae la remuneraci\xF3n o renta mensual si est\xE1 indicada en el documento. Puede aparecer como sueldo, remuneraci\xF3n, renta bruta o l\xEDquida. Valor num\xE9rico entero en pesos sin separador de miles. Si no se menciona, omitir."
          }
        ]
      },
      "certificado-matrimonio": {
        label: "Certificado de Matrimonio",
        shortLabel: "Matrimonio",
        source: "Registro Civil",
        category: "personal",
        freq: "once",
        count: 1,
        maxAge: 180,
        definition: "Certificado oficial del Registro Civil que acredita el matrimonio.",
        fields: [
          {
            key: "folio",
            type: "string",
            internal: true
          },
          {
            key: "codigo_verificacion",
            type: "string",
            internal: true
          },
          {
            key: "circunscripcion",
            type: "string",
            internal: true
          },
          {
            key: "numero_inscripcion",
            type: "string",
            internal: true
          },
          {
            key: "a\xF1o_registro",
            type: "num",
            internal: true
          },
          {
            key: "marido.nombre",
            type: "string",
            internal: true
          },
          {
            key: "marido.rut",
            type: "string",
            internal: true
          },
          {
            key: "marido.fecha_nacimiento",
            type: "date",
            internal: true
          },
          {
            key: "mujer.nombre",
            type: "string",
            internal: true
          },
          {
            key: "mujer.rut",
            type: "string",
            internal: true
          },
          {
            key: "mujer.fecha_nacimiento",
            type: "date",
            internal: true
          },
          {
            key: "fecha_celebracion",
            type: "date",
            internal: true
          },
          {
            key: "hora_celebracion",
            type: "time",
            internal: true
          },
          {
            key: "regimen_patrimonial",
            type: "string",
            internal: true
          },
          {
            key: "fecha_emision",
            type: "date",
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Ingresa a <a href='https://www.registrocivil.cl' target='_blank' rel='noopener'>www.registrocivil.cl</a>",
            "Haz clic en <b>Obtener Certificados</b>",
            "Selecciona <b>Certificado de Matrimonio</b>",
            "Inicia sesi\xF3n con tu Clave\xDAnica",
            "Descarga el certificado en formato PDF"
          ],
          tips: [
            "El certificado tiene validez de 60 d\xEDas"
          ]
        }
      },
      "certificado-no-matrimonio": {
        label: "Cert. No Matrimonio",
        shortLabel: "Cert. No Matrimonio",
        source: "Registro Civil",
        category: "personal",
        freq: "once",
        count: 1,
        maxAge: 90,
        definition: "Certificado del Registro Civil que acredita que una persona no tiene matrimonio vigente.",
        fields: [
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          }
        ]
      },
      "cert-cotizaciones-afp": {
        label: "Cert. de Cotizaciones AFP",
        shortLabel: "Cotizaciones AFP",
        source: "Previred",
        category: "ingresos",
        freq: "once",
        count: 1,
        maxAge: 30,
        definition: "Certificado que acredita las cotizaciones previsionales de un trabajador. Muestra cada per\xEDodo con sus cotizaciones, permitiendo detectar lagunas (meses sin cotizaci\xF3n de empleador).",
        fields: [
          {
            key: "afp",
            type: "string",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "periodo_desde",
            type: "string",
            internal: true
          },
          {
            key: "periodo_hasta",
            type: "string",
            internal: true
          },
          {
            key: "folio_certificacion",
            type: "string",
            internal: true
          },
          {
            key: "codigo_validador",
            type: "string",
            internal: true
          },
          {
            key: "cotizaciones",
            type: "list",
            ai: 'Extrae TODAS las filas de la tabla de cotizaciones como array. Cada entrada tiene: periodo (formato MM-YYYY), tipo ("normal" si es COTIZACION NORMAL pagada por empleador, "independiente" si es COT. NORMAL AFIL. INDEPENDIENTE pagada por el afiliado), monto (monto en pesos como n\xFAmero entero sin separadores), rut_pagador (RUT del pagador). Si un per\xEDodo tiene m\xFAltiples entradas (ej: normal + independiente), incluye ambas como filas separadas.',
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Ingresa a <a href='https://www.previred.com' target='_blank' rel='noopener'>www.previred.com</a>",
            "Haz clic en <b>Trabajador</b> y luego <b>Certificados</b>",
            "Inicia sesi\xF3n con tu Clave\xDAnica",
            "Selecciona el per\xEDodo requerido",
            "Descarga el certificado en formato PDF"
          ],
          tips: [
            "El certificado muestra las \xFAltimas 12 cotizaciones",
            "Puedes filtrar por empleador si tienes varios"
          ]
        }
      },
      "certificado-afp": {
        label: "Certificado de AFP",
        shortLabel: "Cert AFP",
        source: "AFP",
        category: "ingresos",
        definition: "Certificado emitido por la AFP con informaci\xF3n de cotizaciones y saldo.",
        fields: [
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "afp",
            type: "string",
            internal: true
          },
          {
            key: "saldo",
            type: "num",
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Ingresa a <a href='https://www.spensiones.cl' target='_blank' rel='noopener'>www.spensiones.cl</a>",
            "Haz clic en <b>Mi Cuenta Individual</b>",
            "Inicia sesi\xF3n con tu Clave\xDAnica",
            "Ve a la secci\xF3n <b>Certificados</b>",
            "Descarga tu Certificado de Cotizaciones o Saldo"
          ],
          tips: [
            "Si no conoces tu AFP, consulta en el mismo sitio"
          ]
        }
      },
      "depositos-pagos-arriendo": {
        label: "Dep\xF3sitos de Arriendo",
        shortLabel: "Dep Arriendo",
        source: "Banco",
        category: "ingresos",
        freq: "monthly",
        count: 6,
        graceDays: 10,
        definition: "Dep\xF3sitos de pago de arriendo mensual.",
        fields: [
          {
            key: "arrendatario",
            type: "string",
            internal: true
          },
          {
            key: "periodo",
            type: "month",
            internal: true
          },
          {
            key: "monto",
            type: "num",
            internal: true
          }
        ]
      },
      "liquidaciones-sueldo": {
        label: "Liquidaciones de Sueldo",
        shortLabel: "Liquidaci\xF3n",
        source: "Empleador",
        category: "ingresos",
        freq: "monthly",
        count: 6,
        graceDays: 10,
        definition: "Documento que detalla la remuneraci\xF3n mensual de un trabajador.",
        fields: [
          {
            key: "empleador",
            type: "string",
            ai: "Nombre legal de la empresa que emite el documento. Aparece en el membrete o encabezado, generalmente en la parte superior. No confundir con el nombre del trabajador (campo NOMBRE). Suele incluir S.A., Ltda., SpA u otra forma jur\xEDdica.",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "periodo",
            type: "month",
            internal: true
          },
          {
            key: "dias_trabajados",
            type: "num",
            internal: true
          },
          {
            key: "fecha_ingreso",
            type: "date",
            internal: true
          },
          {
            key: "cargo",
            type: "string",
            internal: true
          },
          {
            key: "institucion_previsional",
            type: "string",
            internal: true
          },
          {
            key: "institucion_salud",
            type: "string",
            internal: true
          },
          {
            key: "base_imponible",
            type: "num",
            internal: true
          },
          {
            key: "base_tributable",
            type: "num",
            internal: true
          },
          {
            key: "haberes",
            type: "list",
            ai: "Extrae TODOS los \xEDtems de haberes/ingresos como array de {label, value}. Incluye haberes imponibles Y no imponibles (colaci\xF3n, movilizaci\xF3n). Usa el nombre exacto del documento (ej: 'Sueldo Base', 'Gratificaci\xF3n Legal', 'Bono Responsabilidad', 'Horas Extras', 'Colaci\xF3n', 'Movilizaci\xF3n'). value es el monto num\xE9rico entero (sin separador de miles). NO incluyas subtotales como 'Total Imponible', 'Total No Imponible', 'Total Haberes', 'Base Imponible'.",
            internal: true
          },
          {
            key: "descuentos",
            type: "list",
            ai: "Extrae TODOS los \xEDtems de descuentos como array de {label, value}. Incluye AFP, salud, cesant\xEDa, impuesto \xFAnico, anticipos, cuotas, pr\xE9stamos, etc. Usa el nombre exacto del documento. value es el monto num\xE9rico entero (sin separador de miles). NO incluyas subtotales como 'Total Leyes Soc.', 'Total Descuentos', 'Total Otros Descuentos'.",
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Solicita tu liquidaci\xF3n a tu empleador o al \xE1rea de RRHH",
            "Si tu empresa usa portal de empleados, desc\xE1rgala desde ah\xED",
            "Aseg\xFArate que muestre: nombre, RUT, sueldo bruto, descuentos y l\xEDquido"
          ],
          tips: [
            "Las liquidaciones deben ser de los \xFAltimos 3-6 meses seg\xFAn se solicite",
            "Si no tienes acceso digital, toma una foto clara del documento"
          ]
        }
      },
      "pagos-renta-vitalicia": {
        label: "Pagos Renta Vitalicia",
        shortLabel: "Renta Vitalicia",
        source: "Compa\xF1\xEDa de Seguros",
        category: "ingresos",
        freq: "monthly",
        count: 3,
        graceDays: 10,
        definition: "Documento que detalla la remuneraci\xF3n mensual de un jubilado.",
        fields: [
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "periodo",
            type: "month",
            internal: true
          },
          {
            key: "monto",
            type: "num",
            internal: true
          }
        ]
      },
      "resumen-boletas-sii": {
        label: "Boletas de Honorarios Anual",
        shortLabel: "Boletas",
        source: "SII",
        category: "ingresos",
        freq: "annual",
        count: 2,
        graceDays: 90,
        definition: "Resumen anual de boletas de honorarios emitidas por un contribuyente.",
        fields: [
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "contribuyente",
            type: "string",
            internal: true
          },
          {
            key: "a\xF1o",
            type: "num",
            internal: true
          },
          {
            key: "totales.boletas_vigentes",
            type: "num",
            internal: true
          },
          {
            key: "totales.boletas_anuladas",
            type: "num",
            internal: true
          },
          {
            key: "totales.honorario_bruto",
            type: "num",
            internal: true
          },
          {
            key: "totales.retencion_terceros",
            type: "num",
            internal: true
          },
          {
            key: "totales.retencion_contribuyente",
            type: "num",
            internal: true
          },
          {
            key: "totales.total_liquido",
            type: "num"
          },
          {
            key: "meses",
            type: "obj",
            ai: "Extrae el desglose mensual como objeto donde cada clave es el mes (enero, febrero, etc.) con boletas_vigentes, honorario_bruto, retencion y liquido",
            internal: true
          }
        ]
      },
      "balance-anual": {
        label: "Balance Anual",
        shortLabel: "Balance",
        source: "SII",
        category: "tributario",
        freq: "annual",
        count: 2,
        graceDays: 90,
        definition: "Balance contable anual de una empresa.",
        fields: [
          {
            key: "empresa",
            type: "string",
            internal: true
          },
          {
            key: "year",
            type: "string",
            internal: true
          },
          {
            key: "ingresos",
            type: "num",
            internal: true
          },
          {
            key: "egresos",
            type: "num",
            internal: true
          }
        ]
      },
      "carpeta-tributaria": {
        label: "Carpeta Tributaria",
        source: "SII",
        category: "tributario",
        freq: "once",
        count: 1,
        maxAge: 30,
        definition: "Documento del SII con informaci\xF3n tributaria del contribuyente.",
        fields: [
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "actividades",
            type: "list",
            ai: "Extrae todas las actividades econ\xF3micas del contribuyente como array de strings",
            internal: true
          },
          {
            key: "socios",
            type: "list",
            ai: "Extrae los socios de la empresa incluyendo nombre, RUT y porcentaje de participaci\xF3n de cada uno",
            internal: true
          }
        ],
        howToObtain: {
          steps: [
            "Ingresa a <a href='https://www.sii.cl' target='_blank' rel='noopener'>www.sii.cl</a>",
            "Haz clic en <b>Servicios Online</b> \u2192 <b>Situaci\xF3n Tributaria</b>",
            "Inicia sesi\xF3n con tu Clave\xDAnica o Clave SII",
            "Selecciona <b>Obtener Carpeta Tributaria Electr\xF3nica</b>",
            "Elige <b>Para Tr\xE1mites</b> (o la opci\xF3n que corresponda)",
            "Descarga el PDF generado"
          ],
          tips: [
            "La carpeta incluye informaci\xF3n de los \xFAltimos 3 a\xF1os tributarios",
            "Tiene validez de 30 d\xEDas desde su emisi\xF3n"
          ]
        }
      },
      "acreditacion-cuota": {
        label: "Acreditaci\xF3n de Cuota",
        shortLabel: "Cuota",
        source: "Banco",
        category: "deudas",
        freq: "monthly",
        count: 3,
        graceDays: 10,
        definition: "Comprobante de pago de cuota de cr\xE9dito o pr\xE9stamo.",
        fields: [
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "periodo",
            type: "month",
            internal: true
          },
          {
            key: "cuota_actual",
            type: "num",
            internal: true
          },
          {
            key: "total_cuotas",
            type: "num",
            internal: true
          },
          {
            key: "saldo_insoluto",
            type: "num",
            internal: true
          },
          {
            key: "caev",
            type: "num",
            internal: true
          }
        ]
      },
      "deuda-comercial": {
        label: "Deuda Comercial",
        source: "Banco",
        category: "deudas",
        multiInstance: true,
        definition: "Deuda comercial, l\xEDnea de cr\xE9dito o cr\xE9dito empresarial vigente. Incluye resumen de portales bancarios, certificados de deuda comercial o estados de l\xEDnea de cr\xE9dito. Puede ser impresi\xF3n de pantalla del sitio web del banco.",
        fields: [
          {
            key: "entidad",
            type: "string",
            internal: true
          },
          {
            key: "tipo",
            type: "string",
            internal: true
          },
          {
            key: "monto",
            type: "num",
            internal: true
          },
          {
            key: "cuota_mensual",
            type: "num",
            internal: true
          },
          {
            key: "saldo_insoluto",
            type: "num",
            internal: true
          },
          {
            key: "cuotas_vencidas",
            type: "num",
            internal: true
          },
          {
            key: "cuotas_por_pagar",
            type: "num",
            internal: true
          },
          {
            key: "caev",
            type: "num",
            internal: true
          }
        ]
      },
      "deuda-consumo": {
        label: "Cr\xE9dito de Consumo",
        shortLabel: "Consumo",
        source: "Banco",
        category: "deudas",
        freq: "once",
        count: 1,
        multiInstance: true,
        maxAge: 30,
        definition: "Cr\xE9dito de consumo vigente. Incluye resumen de cr\xE9ditos de portales bancarios (BCI, BancoEstado, Santander, Scotiabank, etc.), certificados de deuda, tablas de amortizaci\xF3n o cualquier documento que muestre un pr\xE9stamo personal o de consumo con monto, saldo, cuotas y vencimiento. Puede ser impresi\xF3n de pantalla del sitio web del banco.",
        fields: [
          {
            key: "entidad",
            type: "string",
            internal: true
          },
          {
            key: "numero_credito",
            type: "string",
            internal: true
          },
          {
            key: "descripcion",
            type: "string",
            internal: true
          },
          {
            key: "tipo",
            type: "string",
            ai: "D=Directo, I=Indirecto",
            internal: true
          },
          {
            key: "monto",
            type: "num",
            internal: true
          },
          {
            key: "saldo",
            type: "num",
            internal: true
          },
          {
            key: "cuota",
            type: "num"
          },
          {
            key: "vencimiento",
            type: "string",
            internal: true
          },
          {
            key: "cuotas_pagadas",
            type: "num"
          },
          {
            key: "cuotas_totales",
            type: "num"
          }
        ]
      },
      "deuda-hipotecaria": {
        label: "Deuda Hipotecaria",
        source: "Banco",
        category: "deudas",
        freq: "once",
        count: 1,
        multiInstance: true,
        definition: "Cr\xE9dito hipotecario o mutuario vigente. Incluye resumen de cr\xE9ditos hipotecarios de portales bancarios, certificados de deuda hipotecaria, tablas de amortizaci\xF3n o dividendos. Puede ser impresi\xF3n de pantalla del sitio web del banco.",
        fields: [
          {
            key: "entidad",
            type: "string",
            internal: true
          },
          {
            key: "monto_credito",
            type: "num",
            internal: true
          },
          {
            key: "cuota_mensual",
            type: "num",
            internal: true
          },
          {
            key: "saldo_insoluto",
            type: "num",
            internal: true
          },
          {
            key: "tasa_interes",
            type: "num",
            internal: true
          },
          {
            key: "cuotas_vencidas",
            type: "num",
            internal: true
          },
          {
            key: "cuotas_por_pagar",
            type: "num",
            internal: true
          },
          {
            key: "caev",
            type: "num",
            internal: true
          }
        ]
      },
      "informe-deuda": {
        label: "Informe de Deuda CMF",
        shortLabel: "Deuda",
        source: "CMF",
        category: "deudas",
        freq: "once",
        count: 1,
        maxAge: 30,
        definition: "Informe de deuda de la CMF (Comisi\xF3n para el Mercado Financiero, cmfchile.cl). NO incluye informes comerciales de Maat, Equifax, Dicom o TransUnion.",
        fields: [
          {
            key: "rut",
            type: "string",
            internal: true
          },
          {
            key: "nombre",
            type: "string",
            internal: true
          },
          {
            key: "deuda_total",
            type: "num",
            internal: true
          },
          {
            key: "fecha_informe",
            type: "string",
            internal: true
          },
          {
            key: "deudas",
            type: "list",
            ai: "Extrae TODAS las deudas de la tabla 'Deuda Directa' como array, donde cada entrada tiene: entidad, tipo (Consumo/Vivienda/Comercial/etc.), total_credito, vigente, atraso_30_59, atraso_60_89, atraso_90_mas",
            internal: true
          }
        ]
      },
      "avaluo-fiscal": {
        label: "Aval\xFAo Fiscal",
        source: "TGR",
        category: "activos",
        multiInstance: true,
        maxAge: 365,
        definition: "Aval\xFAo fiscal de una propiedad para acreditar bien ra\xEDz.",
        fields: [
          {
            key: "propietarios",
            type: "list",
            ai: "Extrae la lista de propietarios como array, donde cada entrada tiene: nombre, rut y porcentaje de participaci\xF3n"
          },
          {
            key: "avaluo_total",
            type: "num"
          }
        ]
      },
      "compraventa-propiedad": {
        label: "Compraventa de Propiedad",
        shortLabel: "Compraventa",
        source: "Notar\xEDa",
        category: "activos",
        freq: "once",
        count: 1,
        definition: "Documento de compraventa de bien inmueble nuevo o usado.",
        fields: [
          {
            key: "comprador",
            type: "string",
            internal: true
          },
          {
            key: "vendedor",
            type: "string",
            internal: true
          },
          {
            key: "direccion",
            type: "string",
            internal: true
          },
          {
            key: "monto",
            type: "num",
            internal: true
          }
        ]
      },
      "cotizacion-propiedad": {
        label: "Cotizaci\xF3n de Nueva Propiedad",
        shortLabel: "Valor Propiedad",
        source: "Corredor / Inmobiliaria",
        category: "activos",
        multiInstance: true,
        definition: "Tasaci\xF3n o cotizaci\xF3n del valor de una propiedad inmueble.",
        fields: [
          {
            key: "direccion",
            type: "string",
            internal: true
          },
          {
            key: "valor_comercial",
            type: "num",
            internal: true
          }
        ]
      },
      "cuenta-ahorro": {
        label: "Cuenta de Ahorro",
        shortLabel: "Ahorro",
        source: "Banco",
        category: "activos",
        multiInstance: true,
        definition: "Informaci\xF3n sobre cuentas de ahorro bancarias.",
        fields: [
          {
            key: "banco",
            type: "string",
            internal: true
          },
          {
            key: "tipo_cuenta",
            type: "string",
            internal: true
          },
          {
            key: "saldo",
            type: "num",
            internal: true
          }
        ]
      },
      inversiones: {
        label: "Inversiones",
        source: "Banco",
        category: "activos",
        multiInstance: true,
        definition: "Informaci\xF3n sobre inversiones bancarias o financieras.",
        fields: [
          {
            key: "titular",
            type: "string",
            internal: true
          },
          {
            key: "banco",
            type: "string",
            internal: true
          },
          {
            key: "saldo",
            type: "num",
            internal: true
          }
        ]
      },
      padron: {
        label: "Padr\xF3n de Veh\xEDculo",
        shortLabel: "Padr\xF3n",
        source: "Registro Civil",
        category: "activos",
        freq: "once",
        count: 1,
        multiInstance: true,
        maxAge: 90,
        definition: "Certificado de inscripci\xF3n de veh\xEDculo motorizado.",
        fields: [
          {
            key: "inscripcion",
            type: "string",
            internal: true
          },
          {
            key: "rut_propietario",
            type: "string",
            internal: true
          },
          {
            key: "propietario",
            type: "string",
            internal: true
          },
          {
            key: "domicilio",
            type: "string",
            internal: true
          },
          {
            key: "comuna",
            type: "string",
            internal: true
          },
          {
            key: "fecha_adquisicion",
            type: "date",
            internal: true
          },
          {
            key: "fecha_inscripcion",
            type: "date",
            internal: true
          },
          {
            key: "fecha_emision",
            type: "date",
            internal: true
          },
          {
            key: "marca",
            type: "string",
            internal: true
          },
          {
            key: "modelo",
            type: "string",
            internal: true
          },
          {
            key: "motor",
            type: "string",
            internal: true
          },
          {
            key: "chasis",
            type: "string",
            internal: true
          },
          {
            key: "color",
            type: "string",
            internal: true
          },
          {
            key: "tasacion_fiscal",
            type: "num",
            internal: true
          },
          {
            key: "a\xF1o",
            type: "num"
          },
          {
            key: "precio_mercado_clp",
            type: "num",
            ai: "Averigua su valor de mercado actual en CLP bas\xE1ndose en la marca, modelo, a\xF1o dado que es un veh\xEDculo usado en Chile.",
            internal: true
          }
        ]
      }
    };
  }
});

// src/doctypes.ts
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
  if (expandedCache) return expandedCache;
  const raw = doctypes_default;
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
function getDoctypes() {
  const map = getDoctypesMap();
  return Object.entries(map).map(([id, doctype]) => ({
    id,
    ...doctype
  })).sort((a, b) => a.label.localeCompare(b.label));
}
var TYPE_DEFAULTS, expandedCache;
var init_doctypes2 = __esm({
  "src/doctypes.ts"() {
    init_doctypes();
    TYPE_DEFAULTS = {
      string: "",
      date: "YYYY-MM-DD",
      month: "YYYY-MM",
      time: "HH:MM",
      num: 0,
      bool: false,
      list: [],
      obj: {}
    };
    expandedCache = null;
  }
});
async function detectCardBounds(buffer) {
  try {
    const { data, info } = await sharp3__default.default(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    const threshold = 140;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const brightness = data[y * info.width + x];
        if (brightness > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX > minX && maxY > minY) {
      const originalArea = info.width * info.height;
      const detectedArea = (maxX - minX) * (maxY - minY);
      if (detectedArea < originalArea * 0.9) {
        return {
          left: Math.max(0, minX - 5),
          top: Math.max(0, minY - 5),
          width: Math.min(maxX - minX + 10, info.width - minX),
          height: Math.min(maxY - minY + 10, info.height - minY)
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
async function detectAndCropFace(buffer) {
  try {
    const cardBounds = await detectCardBounds(buffer);
    let cardBuffer = buffer;
    let width, height;
    if (cardBounds) {
      cardBuffer = await sharp3__default.default(buffer).extract(cardBounds).toBuffer();
      width = cardBounds.width;
      height = cardBounds.height;
    } else {
      const metadata = await sharp3__default.default(buffer).metadata();
      if (!metadata.width || !metadata.height) return null;
      width = metadata.width;
      height = metadata.height;
    }
    const aspectRatio = height / width;
    const isComposite = aspectRatio > 1.2;
    const regionHeight = isComposite ? Math.round(height * 0.5) : height;
    const regionWidth = Math.round(width * 0.4);
    const regionBuffer = await sharp3__default.default(cardBuffer).extract({
      left: 0,
      top: 0,
      width: regionWidth,
      height: regionHeight
    }).toBuffer();
    const faceWidth = Math.round(regionWidth * 0.5);
    const faceHeight = Math.round(regionHeight * 0.6);
    const boostRegion = {
      x: Math.round(regionWidth * 0.05),
      y: Math.round(regionHeight * 0.05),
      width: Math.round(regionWidth * 0.6),
      height: Math.round(regionHeight * 0.7),
      weight: 2
    };
    const result = await smartcrop__default.default.crop(regionBuffer, {
      width: faceWidth,
      height: faceHeight,
      boost: [boostRegion]
    });
    const crop = result.topCrop;
    const croppedBuffer = await sharp3__default.default(regionBuffer).extract({
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height
    }).resize(256, 256, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
    if (croppedBuffer.length < 5e3) {
      return null;
    }
    return croppedBuffer.toString("base64");
  } catch (err) {
    getLogger().error(err, { module: "face-detect", action: "detect-face" });
    return null;
  }
}
var init_facedetect = __esm({
  "src/facedetect.ts"() {
    init_config();
  }
});
async function cropCardWithGemini(imageBuffer) {
  if (!process.env.GEMINI_API_KEY) return null;
  if (Date.now() < cooldownUntil) return null;
  try {
    const metadata = await sharp3__default.default(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    const cardBbox = await findCard(imageBuffer);
    if (!cardBbox) return null;
    const cardBuffer = await cropRegion(imageBuffer, cardBbox, metadata.width, metadata.height);
    return cardBuffer;
  } catch (err) {
    if (err?.status === 429 || err?.httpErrorCode === 429 || err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
      cooldownUntil = Date.now() + 6e4;
    }
    getLogger().error(err, { module: "face-extract-v2", action: "cropCard" });
    return null;
  }
}
async function findCard(imageBuffer) {
  const base64 = imageBuffer.toString("base64");
  const gemini = await getGemini2();
  const prompt = `Find the FRONT side of a Chilean ID card (c\xE9dula de identidad) in this image.

The FRONT side has a passport-style photo on the left. The BACK side has text only, no photo.

If the image contains both front and back (composite scan), locate ONLY the front side.
If only one card is visible, determine if it's the front (has photo) or back (no photo).

Return JSON with the front card's location as PERCENTAGES (0-100) of the FULL IMAGE:

{"card": {"x": 5, "y": 10, "width": 90, "height": 40}}

- "x" = percentage from LEFT edge of image to left edge of card
- "y" = percentage from TOP edge of image to top edge of card
- "width" = card width as percentage of image width
- "height" = card height as percentage of image height
- If no front side c\xE9dula is visible, return {"card": null}
- Return ONLY valid JSON, no markdown.`;
  const result = await gemini.models.generateContent({
    model: "gemini-2.0-flash",
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: base64 } }
      ]
    }
  });
  const text = result.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.card) return null;
  const c = parsed.card;
  if (typeof c.x !== "number" || typeof c.y !== "number" || typeof c.width !== "number" || typeof c.height !== "number") return null;
  return c;
}
async function cropRegion(buffer, bbox, imgW, imgH) {
  const { x, y, width: bw, height: bh } = bbox;
  if (x < 0 || y < 0 || bw <= 0 || bh <= 0) return null;
  if (x + bw > 110 || y + bh > 110) return null;
  const pad = 2;
  const px = Math.max(0, x - pad);
  const py = Math.max(0, y - pad);
  const pw = Math.min(bw + pad * 2, 100 - px);
  const ph = Math.min(bh + pad * 2, 100 - py);
  const left = Math.max(0, Math.round(px / 100 * imgW));
  const top = Math.max(0, Math.round(py / 100 * imgH));
  const width = Math.min(Math.round(pw / 100 * imgW), imgW - left);
  const height = Math.min(Math.round(ph / 100 * imgH), imgH - top);
  if (width <= 10 || height <= 10) return null;
  return sharp3__default.default(buffer).extract({ left, top, width, height }).toBuffer();
}
var geminiClient2, getGemini2, cooldownUntil;
var init_faceextract = __esm({
  "src/faceextract.ts"() {
    init_config();
    geminiClient2 = null;
    getGemini2 = async () => {
      if (!geminiClient2) {
        const { GoogleGenAI } = await import('@google/genai');
        geminiClient2 = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      }
      return geminiClient2;
    };
    cooldownUntil = 0;
  }
});

// src/ocr.ts
var ocr_exports = {};
__export(ocr_exports, {
  Doc2Fields: () => Doc2Fields,
  buildCacheKey: () => buildCacheKey,
  detectCedulaSide: () => detectCedulaSide,
  extractPdfPageAsImage: () => extractPdfPageAsImage,
  getPromptVersion: () => getPromptVersion,
  normalizeDoc: () => normalizeDoc,
  parseRawDocs: () => parseRawDocs
});
function getPromptVersion() {
  return crypto.createHash("sha256").update(JSON.stringify(getDoctypes())).update(PROMPT_TEMPLATE_VERSION).digest("hex").slice(0, 12);
}
function buildCacheKey(fileHash, model, promptVersion) {
  return crypto.createHash("sha256").update(fileHash + model + promptVersion).digest("hex").slice(0, 32);
}
async function extractFaceWithGemini(imageBuffer) {
  if (!process.env.GEMINI_API_KEY) return null;
  if (Date.now() < geminiFaceCooldownUntil) return null;
  try {
    const metadata = await sharp3__default.default(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    const base64 = imageBuffer.toString("base64");
    const gemini = await getGemini3();
    const prompt = `Analyze this scanned document containing a Chilean ID card (c\xE9dula de identidad).

The ID card has a RECTANGULAR PHOTOGRAPH of a person's face in the upper-left area of the card. This photo shows their head, neck and shoulders against a light background.

Locate this rectangular ID photograph and return its bounding box coordinates.

IMPORTANT: Return coordinates as [y_min, x_min, y_max, x_max] normalized to 0-1000 scale.

Example response format:
{"box": [50, 80, 180, 200]}

Return ONLY valid JSON, nothing else.`;
    const result = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: base64 } }
        ]
      }
    });
    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const box = parsed.box;
    if (!Array.isArray(box) || box.length !== 4) return null;
    const [ymin, xmin, ymax, xmax] = box;
    const imgW = metadata.width;
    const imgH = metadata.height;
    const left = Math.round(xmin / 1e3 * imgW);
    const top = Math.round(ymin / 1e3 * imgH);
    const width = Math.round((xmax - xmin) / 1e3 * imgW);
    const height = Math.round((ymax - ymin) / 1e3 * imgH);
    if (width <= 10 || height <= 10) return null;
    if (left < 0 || top < 0 || left + width > imgW || top + height > imgH) return null;
    const photo = await sharp3__default.default(imageBuffer).extract({ left, top, width, height }).resize(256, 256, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
    if (photo.length < 5e3) return null;
    return photo.toString("base64");
  } catch (err) {
    if (err?.status === 429 || err?.httpErrorCode === 429 || err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
      geminiFaceCooldownUntil = Date.now() + 6e4;
    }
    getLogger().error(err, { module: "ocr", action: "gemini-face-extraction" });
    return null;
  }
}
async function detectCedulaBounds(buffer) {
  try {
    const { data, info } = await sharp3__default.default(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    const rowBrightness = [];
    for (let y = 0; y < info.height; y++) {
      let darkPixels = 0;
      for (let x = 0; x < info.width; x++) {
        const brightness = data[y * info.width + x];
        if (brightness < 200) darkPixels++;
      }
      rowBrightness.push(darkPixels / info.width);
    }
    let topRow = 0;
    let bottomRow = info.height - 1;
    const threshold = 0.05;
    for (let y = 0; y < info.height; y++) {
      if (rowBrightness[y] > threshold) {
        topRow = y;
        break;
      }
    }
    for (let y = info.height - 1; y >= 0; y--) {
      if (rowBrightness[y] > threshold) {
        bottomRow = y;
        break;
      }
    }
    const colBrightness = [];
    for (let x = 0; x < info.width; x++) {
      let darkPixels = 0;
      for (let y = 0; y < info.height; y++) {
        const brightness = data[y * info.width + x];
        if (brightness < 200) darkPixels++;
      }
      colBrightness.push(darkPixels / info.height);
    }
    let leftCol = 0;
    let rightCol = info.width - 1;
    for (let x = 0; x < info.width; x++) {
      if (colBrightness[x] > threshold) {
        leftCol = x;
        break;
      }
    }
    for (let x = info.width - 1; x >= 0; x--) {
      if (colBrightness[x] > threshold) {
        rightCol = x;
        break;
      }
    }
    const detectedWidth = rightCol - leftCol;
    const detectedHeight = bottomRow - topRow;
    const originalArea = info.width * info.height;
    const detectedArea = detectedWidth * detectedHeight;
    if (detectedArea < originalArea * 0.85 && detectedWidth > 100 && detectedHeight > 50) {
      const padding = 10;
      return {
        left: Math.max(0, leftCol - padding),
        top: Math.max(0, topRow - padding),
        width: Math.min(detectedWidth + padding * 2, info.width - leftCol + padding),
        height: Math.min(detectedHeight + padding * 2, info.height - topRow + padding)
      };
    }
    return null;
  } catch {
    return null;
  }
}
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
async function cropToFrontCard(imageBuffer) {
  try {
    const bounds = await detectCedulaBounds(imageBuffer);
    let workBuffer = imageBuffer;
    let w, h;
    if (bounds) {
      workBuffer = await sharp3__default.default(imageBuffer).extract(bounds).toBuffer();
      w = bounds.width;
      h = bounds.height;
    } else {
      const meta = await sharp3__default.default(imageBuffer).metadata();
      if (!meta.width || !meta.height) return imageBuffer;
      w = meta.width;
      h = meta.height;
    }
    if (h / w > ASPECT_RATIO_THRESHOLD) {
      const halfH = Math.round(h / 2);
      workBuffer = await sharp3__default.default(workBuffer).extract({ left: 0, top: 0, width: w, height: halfH }).toBuffer();
      const frontBounds = await detectCedulaBounds(workBuffer);
      if (frontBounds) {
        workBuffer = await sharp3__default.default(workBuffer).extract(frontBounds).toBuffer();
      }
    }
    return workBuffer;
  } catch {
    return imageBuffer;
  }
}
async function cropPhotoFromImage(buffer, bbox) {
  try {
    const cedulaBounds = await detectCedulaBounds(buffer);
    let workingBuffer = buffer;
    let workingWidth;
    let workingHeight;
    if (cedulaBounds) {
      workingBuffer = await sharp3__default.default(buffer).extract(cedulaBounds).toBuffer();
      workingWidth = cedulaBounds.width;
      workingHeight = cedulaBounds.height;
    } else {
      const metadata = await sharp3__default.default(buffer).metadata();
      if (!metadata.width || !metadata.height) return null;
      workingWidth = metadata.width;
      workingHeight = metadata.height;
    }
    const aspectRatio = workingHeight / workingWidth;
    if (aspectRatio > ASPECT_RATIO_THRESHOLD) {
      const halfHeight = Math.round(workingHeight / 2);
      workingBuffer = await sharp3__default.default(workingBuffer).extract({ left: 0, top: 0, width: workingWidth, height: halfHeight }).toBuffer();
      workingHeight = halfHeight;
      const frontBounds = await detectCedulaBounds(workingBuffer);
      if (frontBounds) {
        workingBuffer = await sharp3__default.default(workingBuffer).extract(frontBounds).toBuffer();
        workingWidth = frontBounds.width;
        workingHeight = frontBounds.height;
      }
    }
    const left = Math.round(bbox.x / 100 * workingWidth);
    const top = Math.round(bbox.y / 100 * workingHeight);
    const width = Math.round(bbox.width / 100 * workingWidth);
    const height = Math.round(bbox.height / 100 * workingHeight);
    const safeLeft = Math.max(0, Math.min(left, workingWidth - 1));
    const safeTop = Math.max(0, Math.min(top, workingHeight - 1));
    const safeWidth = Math.min(width, workingWidth - safeLeft);
    const safeHeight = Math.min(height, workingHeight - safeTop);
    if (safeWidth <= 0 || safeHeight <= 0) return null;
    const croppedBuffer = await sharp3__default.default(workingBuffer).extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight }).resize(256, 256, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
    if (croppedBuffer.length < 5e3) {
      return null;
    }
    return croppedBuffer.toString("base64");
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
  const aiModel = model === "gpt5" ? "GPT" : model === "gemini" ? "GEMINI" : "ANTHROPIC";
  let text = await model2vision(aiModel, mimetype, base64, prompt);
  text = text.replace(/```json|```/g, "").trim();
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
        const cardCrop = await cropCardWithGemini(imageBuffer);
        const cardImage = cardCrop || await cropToFrontCard(imageBuffer);
        let foto_base64 = await extractFaceWithGemini(cardImage);
        if (!foto_base64) {
          foto_base64 = await detectAndCropFace(cardImage);
        }
        if (!foto_base64) {
          const aiBbox = data.foto_bbox;
          const hasBbox = aiBbox && typeof aiBbox.x === "number" && typeof aiBbox.y === "number" && typeof aiBbox.width === "number" && typeof aiBbox.height === "number";
          const bbox = hasBbox ? aiBbox : CEDULA_PHOTO_BBOX;
          foto_base64 = await cropPhotoFromImage(cardImage, bbox);
        }
        if (foto_base64) {
          data.foto_base64 = foto_base64;
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
  const cleaned = text.replace(/```json|```/g, "").trim();
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
  const META_KEYS = /* @__PURE__ */ new Set(["id", "doctypeid", "doc_type_id", "data", "docdate", "document_date", "documentDate", "start", "end", "partId", "part_id", "partid", "label"]);
  const flatData = Object.fromEntries(Object.entries(d || {}).filter(([k]) => !META_KEYS.has(k)));
  const data = d?.data && typeof d.data === "object" ? d.data : Object.keys(flatData).length > 0 ? flatData : {};
  const docdate = d?.docdate || d?.document_date || d?.documentDate || null;
  const start = Number.isFinite(d?.start) ? Number(d.start) : d?.start ? parseInt(d.start, 10) : void 0;
  const end = Number.isFinite(d?.end) ? Number(d.end) : d?.end ? parseInt(d.end, 10) : void 0;
  const partId = d?.partId || d?.part_id || d?.partid || void 0;
  return { id, data, docdate, start, end, partId };
}
async function classifyDocument(base64, mimetype, model, isPDF, doctypes) {
  const typeList = doctypes.map((dt) => `\u2022 ${dt.id}: ${dt.definition || dt.label}`).join("\n");
  const prompt = `Identifica los tipos de documento en este archivo chileno.
Si el archivo NO corresponde a ninguno de los tipos listados abajo, devuelve {"documents":[]}.
Devuelve JSON: {"documents":[{"id":"tipo-id"${isPDF ? ',"start":1,"end":1' : ""},"partId":"front|back"}]}
${isPDF ? `"start"/"end": p\xE1ginas 1-indexed. Si un tipo aparece m\xFAltiples veces (ej: varias liquidaciones), devuelve uno por instancia con su rango de p\xE1ginas. P\xE1ginas que no correspondan a ning\xFAn tipo listado deben ignorarse.
Si una p\xE1gina contiene AMBAS caras de una c\xE9dula (frente y reverso), devuelve DOS elementos con la misma p\xE1gina y diferente partId.` : `Si la imagen contiene AMBAS caras de una c\xE9dula (frente y reverso apilados), devuelve DOS elementos. Para otro documento, devuelve uno solo.`}
"partId": solo para c\xE9dula-identidad. Frente tiene foto/RUT/nombre. Reverso tiene firma/huella/profesi\xF3n.
- Si no est\xE1s seguro del tipo, devuelve {"documents":[]}. Es mejor no clasificar que clasificar mal.
Tipos v\xE1lidos:
${typeList}`;
  const text = await model2vision(model, mimetype, base64, prompt);
  const rawDocs = parseRawDocs(text);
  return rawDocs.map((d) => {
    const id = d?.id || d?.doctypeid || null;
    const start = Number.isFinite(d?.start) ? Number(d.start) : d?.start ? parseInt(d.start, 10) : void 0;
    const end = Number.isFinite(d?.end) ? Number(d.end) : d?.end ? parseInt(d.end, 10) : void 0;
    const partId = d?.partId || d?.part_id || d?.partid || void 0;
    return { id, ...Number.isFinite(start) ? { start } : {}, ...Number.isFinite(end) ? { end } : {}, ...partId ? { partId } : {} };
  }).filter((d) => d.id);
}
async function classifyAndExtractImage(base64, mimetype, model, doctypes) {
  const typeList = doctypes.map((dt) => {
    const fields = JSON.stringify(dt.fieldDefs.map((f) => {
      const entry = { key: f.key, type: f.type };
      if (f.ai) entry.ai = f.ai;
      return entry;
    }));
    return `\u2022 ${dt.id}: ${dt.definition || dt.label}
  fields: ${fields}`;
  }).join("\n");
  const prompt = `Identifica y extrae los campos de este documento chileno.
Si la imagen NO corresponde a ninguno de los tipos listados abajo, devuelve {"documents":[]}.
Si la imagen contiene AMBAS caras de una c\xE9dula (frente y reverso apilados), devuelve DOS elementos con "partId": "front" y "back".
Para c\xE9dula front, incluye "foto_bbox" en "data" con coordenadas (0-100%) de la foto: {x, y, width, height}. Incluye cabeza, cuello y hombros.
Devuelve JSON: {"documents":[{"id":"tipo-id","data":{...},"docdate":"YYYY-MM-DD","partId":"front|back"}]}
- "docdate": para documentos peri\xF3dicos (liquidaciones, cotizaciones, boletas), usar la fecha del per\xEDodo. Para c\xE9dula y certificados, usar la fecha de emisi\xF3n. Formato YYYY-MM-DD
- "partId": solo para c\xE9dula-identidad
- No inventes datos salvo campos con instrucci\xF3n "ai"
- Si no est\xE1s seguro del tipo, devuelve {"documents":[]}. Es mejor no clasificar que clasificar mal.
- Solo JSON, sin markdown
Tipos v\xE1lidos:
${typeList}`;
  const text = await model2vision(model, mimetype, base64, prompt);
  return parseRawDocs(text);
}
async function extractFields(base64, mimetype, model, isPDF, docTypeId, doctype, entries) {
  const fields = JSON.stringify(doctype.fieldDefs.map((f) => {
    const entry = { key: f.key, type: f.type };
    if (f.ai) entry.ai = f.ai;
    return entry;
  }));
  const isCedula = docTypeId === "cedula-identidad";
  const cedulaBbox = isCedula ? `
Si partId es "front", incluye "foto_bbox" en "data" con coordenadas (0-100%) de la foto: {x, y, width, height}. Incluye cabeza completa, cuello y hombros.` : "";
  const pageHint = isPDF && entries.length > 0 ? `Documentos detectados en p\xE1ginas: ${entries.map((e) => e.partId ? `${e.start}-${e.end} (${e.partId})` : `${e.start}-${e.end}`).join(", ")}.` : "";
  const prompt = `Extrae los campos de "${doctype.label}" (id: "${docTypeId}").
${pageHint}
Devuelve JSON: {"documents":[{"id":"${docTypeId}","data":{...},"docdate":"YYYY-MM-DD"${isPDF ? ',"start":N,"end":N' : ""}${isCedula ? ',"partId":"front|back"' : ""}}]}
Campos: ${fields}
${cedulaBbox}
- "docdate": para documentos peri\xF3dicos (liquidaciones, cotizaciones, boletas), usar la fecha del per\xEDodo. Para c\xE9dula y certificados, usar la fecha de emisi\xF3n. Formato YYYY-MM-DD
- No inventes datos salvo campos con instrucci\xF3n "ai"
- Distingue entre CERTIFICADO (emitido) y FORMULARIO (para llenar)
- Solo JSON, sin markdown`;
  const text = await model2vision(model, mimetype, base64, prompt);
  return parseRawDocs(text);
}
async function Doc2Fields(buffer, mimetype, model = "gemini", forcedDoctypeId) {
  const isImage = mimetype.startsWith("image/");
  const isPDF = mimetype === "application/pdf";
  if (!isImage && !isPDF) throw new Error("Images and PDFs only");
  const { doctypes, mapById } = loadSchemas();
  const base64 = buffer.toString("base64");
  const aiModel = toAiModel(model);
  let allRawDocs;
  if (forcedDoctypeId) {
    const doctype = mapById[forcedDoctypeId];
    if (!doctype) return { documents: [] };
    allRawDocs = await extractFields(base64, mimetype, aiModel, isPDF, forcedDoctypeId, doctype, [{}]);
  } else if (isImage) {
    allRawDocs = await classifyAndExtractImage(base64, mimetype, aiModel, doctypes);
  } else {
    const CHUNK_THRESHOLD = 8;
    const CHUNK_SIZE = 6;
    let classified;
    let totalPages = 0;
    let pdfDoc = null;
    try {
      pdfDoc = await pdfLib.PDFDocument.load(buffer);
      totalPages = pdfDoc.getPageCount();
      if (totalPages > CHUNK_THRESHOLD) {
        classified = [];
        for (let chunkStart = 1; chunkStart <= totalPages; chunkStart += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, totalPages);
          const indices = Array.from({ length: chunkEnd - chunkStart + 1 }, (_v, i) => chunkStart + i - 1);
          const out = await pdfLib.PDFDocument.create();
          const copied = await out.copyPages(pdfDoc, indices);
          copied.forEach((p) => out.addPage(p));
          const chunkBytes = await out.save();
          const chunkBase64 = Buffer.from(chunkBytes).toString("base64");
          const chunkClassified = await classifyDocument(chunkBase64, mimetype, aiModel, isPDF, doctypes);
          const offset = chunkStart - 1;
          for (const c of chunkClassified) {
            if (c.start != null) c.start += offset;
            if (c.end != null) c.end += offset;
            if (c.start != null && c.start < chunkStart) c.start = chunkStart;
            if (c.end != null && c.end > chunkEnd) c.end = chunkEnd;
            classified.push(c);
          }
        }
      } else {
        classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes);
      }
    } catch {
      classified = await classifyDocument(base64, mimetype, aiModel, isPDF, doctypes);
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
        if (dt && dt.count > 1 && span > 1 && !isCedulaEntry) {
          for (let p = entry.start; p <= entry.end; p++) {
            expanded.push({ id: entry.id, start: p, end: p });
          }
        } else {
          expanded.push(entry);
        }
      }
      classified = expanded;
    }
    const byType = /* @__PURE__ */ new Map();
    for (const c of classified) {
      const existing = byType.get(c.id) || [];
      existing.push({ start: c.start, end: c.end, partId: c.partId });
      byType.set(c.id, existing);
    }
    const MAX_PER_BATCH = 8;
    const extractionPromises = [];
    for (const [docTypeId, entries] of byType) {
      const doctype = mapById[docTypeId];
      if (!doctype) continue;
      let extractBase64 = base64;
      let adjustedEntries = entries;
      if (pdfDoc && totalPages > CHUNK_THRESHOLD && entries.every((e) => e.start != null && e.end != null)) {
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
            extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries.slice(i, i + MAX_PER_BATCH))
          );
        }
      } else {
        extractionPromises.push(
          extractFields(extractBase64, mimetype, aiModel, isPDF, docTypeId, doctype, adjustedEntries)
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
        for (let i = 0; i < sortedClass.length; i++) {
          const cls = sortedClass[i];
          const ext = i < sortedExtracted.length ? sortedExtracted[i] : null;
          allRawDocs.push({
            id: typeId,
            data: ext?.data || {},
            docdate: ext?.docdate || null,
            start: cls.start,
            end: cls.end,
            ...cls.partId ? { partId: cls.partId } : {}
          });
        }
      }
    }
  }
  const documents = await Promise.all(allRawDocs.map(async (d) => {
    const { id, data, docdate, start, end, partId } = normalizeDoc(d);
    if (id === "cedula-identidad" && partId === "front") {
      let imageBuffer = null;
      if (isImage) {
        imageBuffer = buffer;
      } else if (isPDF && typeof start === "number") {
        imageBuffer = await extractPdfPageAsImage(buffer, start);
      }
      if (imageBuffer) {
        const cardCrop = await cropCardWithGemini(imageBuffer);
        const cardImage = cardCrop || await cropToFrontCard(imageBuffer);
        let foto_base64 = await extractFaceWithGemini(cardImage);
        if (!foto_base64) {
          foto_base64 = await detectAndCropFace(cardImage);
        }
        if (!foto_base64) {
          const aiBbox = data.foto_bbox;
          const hasBbox = aiBbox && typeof aiBbox.x === "number" && typeof aiBbox.y === "number" && typeof aiBbox.width === "number" && typeof aiBbox.height === "number";
          const bbox = hasBbox ? aiBbox : CEDULA_PHOTO_BBOX;
          foto_base64 = await cropPhotoFromImage(cardImage, bbox);
        }
        if (foto_base64) {
          data.foto_base64 = foto_base64;
        }
      }
      delete data.foto_bbox;
    }
    return {
      doc_type_id: id,
      label: id ? mapById?.[id]?.label || null : null,
      data,
      docdate,
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
  return { documents };
}
var PROMPT_TEMPLATE_VERSION, pdfToPngModule, getPdfToPng, geminiClient3, getGemini3, geminiFaceCooldownUntil, ASPECT_RATIO_THRESHOLD, CEDULA_PHOTO_BBOX, toAiModel;
var init_ocr = __esm({
  "src/ocr.ts"() {
    init_ai();
    init_doctypes2();
    init_config();
    init_facedetect();
    init_faceextract();
    PROMPT_TEMPLATE_VERSION = "v1";
    pdfToPngModule = null;
    getPdfToPng = async () => {
      if (!pdfToPngModule) {
        pdfToPngModule = await import('pdf-to-png-converter');
      }
      return pdfToPngModule.pdfToPng;
    };
    geminiClient3 = null;
    getGemini3 = async () => {
      if (!geminiClient3) {
        const { GoogleGenAI } = await import('@google/genai');
        geminiClient3 = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      }
      return geminiClient3;
    };
    geminiFaceCooldownUntil = 0;
    ASPECT_RATIO_THRESHOLD = 1.2;
    CEDULA_PHOTO_BBOX = { x: 2, y: 5, width: 30, height: 55 };
    toAiModel = (m) => m === "gpt5" ? "GPT" : m === "gemini" ? "GEMINI" : "ANTHROPIC";
  }
});

// src/index.ts
init_config();
init_ocr();

// src/cedula.ts
init_ocr();
var ASPECT_RATIO_THRESHOLD2 = 1.2;
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
  const { data, info } = await sharp3__default.default(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
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
  const metadata = await sharp3__default.default(imageBuffer).metadata();
  const imgWidth = metadata.width || 0;
  const imgHeight = metadata.height || 0;
  const aspectRatio = imgHeight / (imgWidth || 1);
  if (!(aspectRatio > ASPECT_RATIO_THRESHOLD2 && imgWidth > 0 && imgHeight > 0)) {
    return null;
  }
  const regions = await findCardRegions(imageBuffer).catch(() => null);
  let frontBuf;
  let backBuf;
  if (regions) {
    frontBuf = await sharp3__default.default(imageBuffer).extract(regions.front).toBuffer();
    backBuf = await sharp3__default.default(imageBuffer).extract(regions.back).toBuffer();
  } else {
    const halfHeight = Math.round(imgHeight / 2);
    frontBuf = await sharp3__default.default(imageBuffer).extract({ left: 0, top: 0, width: imgWidth, height: halfHeight }).toBuffer();
    backBuf = await sharp3__default.default(imageBuffer).extract({ left: 0, top: halfHeight, width: imgWidth, height: imgHeight - halfHeight }).toBuffer();
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

// src/utils.ts
init_config();
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
init_doctypes2();
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
var THUMB_WIDTH = 200;
var THUMB_QUALITY = 65;
async function generateThumbnailFromImage(buffer) {
  try {
    return await sharp3__default.default(buffer).resize(THUMB_WIDTH, null, { withoutEnlargement: true }).jpeg({ quality: THUMB_QUALITY, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}
async function generateThumbnailFromPdf(buffer) {
  try {
    const { extractPdfPageAsImage: extractPdfPageAsImage2 } = await Promise.resolve().then(() => (init_ocr(), ocr_exports));
    const pageImage = await extractPdfPageAsImage2(buffer, 1);
    if (!pageImage) return null;
    return await generateThumbnailFromImage(pageImage);
  } catch {
    return null;
  }
}

exports.Doc2Fields = Doc2Fields;
exports.buildCacheKey = buildCacheKey;
exports.configure = configure;
exports.detectAndSplitCompositeCedula = detectAndSplitCompositeCedula;
exports.detectCedulaSide = detectCedulaSide;
exports.extractPdfPageAsImage = extractPdfPageAsImage;
exports.generateThumbnailFromImage = generateThumbnailFromImage;
exports.generateThumbnailFromPdf = generateThumbnailFromPdf;
exports.getPromptVersion = getPromptVersion;
exports.mergeCedulaFiles = mergeCedulaFiles;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map