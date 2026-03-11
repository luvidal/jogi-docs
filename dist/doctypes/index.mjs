// src/doctypes.json
var doctypes_default = {
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

export { applyDefaults, getCategories, getDoctype, getDoctypeIds, getDoctypes, getDoctypesByCategory, getDoctypesLegacyFormat, getDoctypesMap, getDocumentDefaults, getInternalFieldKeys, isDoctypeValid, isMultiInstanceDocType, isRecurring };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map