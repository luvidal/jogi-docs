import sharp2 from 'sharp';
import { DetectFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'crypto';

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
function getClient(opts) {
  if (_client) return _client;
  _client = new RekognitionClient({
    region: opts?.region || process.env.AWS_REGION || "us-east-1",
    ...opts?.credentials ? { credentials: opts.credentials } : {}
  });
  return _client;
}
async function extractFace(imageBuffer, _mimetype, _model, opts) {
  const log = getLogger();
  const metadata = await sharp2(imageBuffer).metadata();
  const imgW = metadata.width || 0;
  const imgH = metadata.height || 0;
  if (!imgW || !imgH) return null;
  const client = getClient(opts);
  let faces;
  try {
    const cmd = new DetectFacesCommand({
      Image: { Bytes: imageBuffer },
      Attributes: ["DEFAULT"]
    });
    const res = await client.send(cmd);
    const details = res.FaceDetails || [];
    if (details.length === 0) return null;
    faces = details.map((d) => {
      const bb = d.BoundingBox;
      const x = (bb.Left || 0) * 100;
      const y = (bb.Top || 0) * 100;
      const width2 = (bb.Width || 0) * 100;
      const height2 = (bb.Height || 0) * 100;
      return {
        bbox: { x, y, width: width2, height: height2 },
        confidence: d.Confidence || 0,
        area: width2 * height2
      };
    });
  } catch (err) {
    log.error(err, { module: "face-extract-v4", action: "rekognition-detect" });
    return null;
  }
  faces.sort((a, b) => b.area - a.area);
  const best = faces[0];
  const PAD = 8;
  let px = Math.max(0, best.bbox.x - PAD);
  let py = Math.max(0, best.bbox.y - PAD);
  let pw = Math.min(best.bbox.width + PAD * 2, 100 - px);
  let ph = Math.min(best.bbox.height + PAD * 2, 100 - py);
  if (pw > ph) {
    const diff = pw - ph;
    py = Math.max(0, py - diff / 2);
    ph = Math.min(pw, 100 - py);
  } else if (ph > pw) {
    const diff = ph - pw;
    px = Math.max(0, px - diff / 2);
    pw = Math.min(ph, 100 - px);
  }
  const left = Math.max(0, Math.round(px / 100 * imgW));
  const top = Math.max(0, Math.round(py / 100 * imgH));
  const width = Math.min(Math.round(pw / 100 * imgW), imgW - left);
  const height = Math.min(Math.round(ph / 100 * imgH), imgH - top);
  if (width <= 10 || height <= 10) return null;
  let face;
  try {
    const photo = await sharp2(imageBuffer).extract({ left, top, width, height }).resize(256, 256, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
    if (photo.length < 5e3) return null;
    face = photo.toString("base64");
  } catch (err) {
    log.error(err, { module: "face-extract-v4", action: "crop" });
    return null;
  }
  return {
    face,
    bbox: best.bbox,
    confidence: best.confidence,
    facesDetected: faces.length
  };
}
var _client;
var init_faceextract = __esm({
  "src/faceextract.ts"() {
    init_config();
    _client = null;
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
  return createHash("sha256").update(JSON.stringify(getDoctypes())).update(PROMPT_TEMPLATE_VERSION).digest("hex").slice(0, 12);
}
function buildCacheKey(fileHash, model, promptVersion) {
  return createHash("sha256").update(fileHash + model + promptVersion).digest("hex").slice(0, 32);
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
async function Doc2Fields(buffer, mimetype, model = "gemini", forcedDoctypeId, options) {
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
      pdfDoc = await PDFDocument.load(buffer);
      totalPages = pdfDoc.getPageCount();
      if (totalPages > CHUNK_THRESHOLD) {
        classified = [];
        for (let chunkStart = 1; chunkStart <= totalPages; chunkStart += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, totalPages);
          const indices = Array.from({ length: chunkEnd - chunkStart + 1 }, (_v, i) => chunkStart + i - 1);
          const out = await PDFDocument.create();
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
            const out = await PDFDocument.create();
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
  const skipFace = options?.skipFace === true;
  const documents = await Promise.all(allRawDocs.map(async (d) => {
    const { id, data, docdate, start, end, partId } = normalizeDoc(d);
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
var PROMPT_TEMPLATE_VERSION, pdfToPngModule, getPdfToPng, toAiModel;
var init_ocr = __esm({
  "src/ocr.ts"() {
    init_ai();
    init_doctypes2();
    init_faceextract();
    PROMPT_TEMPLATE_VERSION = "v1";
    pdfToPngModule = null;
    getPdfToPng = async () => {
      if (!pdfToPngModule) {
        pdfToPngModule = await import('pdf-to-png-converter');
      }
      return pdfToPngModule.pdfToPng;
    };
    toAiModel = (m) => m === "gpt5" ? "GPT" : m === "gemini" ? "GEMINI" : "ANTHROPIC";
  }
});

// src/index.ts
init_config();
init_ocr();

// src/cedula.ts
init_ocr();
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
  const { data, info } = await sharp2(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
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
  const metadata = await sharp2(imageBuffer).metadata();
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
    frontBuf = await sharp2(imageBuffer).extract(regions.front).toBuffer();
    backBuf = await sharp2(imageBuffer).extract(regions.back).toBuffer();
  } else {
    const halfHeight = Math.round(imgHeight / 2);
    frontBuf = await sharp2(imageBuffer).extract({ left: 0, top: 0, width: imgWidth, height: halfHeight }).toBuffer();
    backBuf = await sharp2(imageBuffer).extract({ left: 0, top: halfHeight, width: imgWidth, height: imgHeight - halfHeight }).toBuffer();
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

// src/cedulasplit.ts
init_ai();
init_ocr();
init_faceextract();
init_config();
var toAiModel2 = (m) => m === "gpt5" ? "GPT" : m === "gemini" ? "GEMINI" : "ANTHROPIC";
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
  const text = await model2vision(model, mimetype, base64, BBOX_PROMPT);
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
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
  return sharp2(buffer).extract({ left, top, width, height }).toBuffer();
}
async function detectAndSplitCompositeCedulaV3(imageBuffer, mimetype, model = "gemini") {
  const metadata = await sharp2(imageBuffer).metadata();
  const imgW = metadata.width || 0;
  const imgH = metadata.height || 0;
  if (!imgW || !imgH) return null;
  const aiModel = toAiModel2(model);
  let regions;
  try {
    regions = await findCardRegionsWithAI(imageBuffer, mimetype, aiModel);
  } catch (err) {
    getLogger().error(err, { module: "cedula-split-v3", action: "findRegions" });
    return null;
  }
  if (!regions) return null;
  let frontBuf = await cropRegion(imageBuffer, regions.front, imgW, imgH);
  let backBuf = await cropRegion(imageBuffer, regions.back, imgW, imgH);
  if (!frontBuf || !backBuf) return null;
  const trimOpts = { background: "#FFFFFF", threshold: 80 };
  try {
    frontBuf = await sharp2(frontBuf).trim(trimOpts).toBuffer();
  } catch {
  }
  try {
    backBuf = await sharp2(backBuf).trim(trimOpts).toBuffer();
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

// src/index.ts
init_faceextract();

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
    return await sharp2(buffer).resize(THUMB_WIDTH, null, { withoutEnlargement: true }).jpeg({ quality: THUMB_QUALITY, mozjpeg: true }).toBuffer();
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

export { Doc2Fields, buildCacheKey, configure, detectAndSplitCompositeCedula, detectAndSplitCompositeCedulaV3, detectCedulaSide, extractFace, extractPdfPageAsImage, generateThumbnailFromImage, generateThumbnailFromPdf, getPromptVersion, mergeCedulaFiles };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map