// Inyecta gráficos NATIVOS de Excel (editables, no imágenes) dentro de un .xlsx ya generado por
// ExcelJS. ExcelJS no tiene API para crear gráficos, así que esto edita directamente las partes
// internas del .xlsx (que es un .zip con XML adentro) con JSZip: agrega xl/charts/chartN.xml (la
// definición de cada gráfico) y xl/drawings/drawingN.xml (dónde se ancla en la hoja), y actualiza las
// relaciones y [Content_Types].xml para que Excel los reconozca. Varios gráficos pueden compartir una
// misma hoja (se van agregando anclas al mismo drawing de esa hoja, como hace Excel de verdad).
//
// Pensado para hojas generadas por esta misma app (estructura simple, sin gráficos previos externos)
// — no es un inyector de propósito general para cualquier .xlsx.
import JSZip from "jszip";

const NS_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const REL_CHART = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const CT_CHART = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const CT_DRAWING = "application/vnd.openxmlformats-officedocument.drawing+xml";

function colLettersToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1; // zero-indexed
}

function cellRefToColRow(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(ref).trim().toUpperCase());
  if (!m) throw new Error(`Referencia de celda inválida: "${ref}"`);
  return { col: colLettersToIndex(m[1]), row: Number(m[2]) - 1 };
}

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nextIndex(zip, folder, prefix, ext) {
  const re = new RegExp(`^${folder}/${prefix}(\\d+)\\.${ext}$`);
  let max = 0;
  zip.forEach((path) => {
    const m = re.exec(path);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max + 1;
}

function quoteSheetName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function relsXml(relationships) {
  const body = relationships.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS_RELS}">${body}</Relationships>`;
}

function nextRelId(existingXml) {
  const ids = [...(existingXml || "").matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const max = ids.length ? Math.max(...ids) : 0;
  return `rId${max + 1}`;
}

async function findSheetPath(zip, sheetName) {
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const sheetTagRe = /<sheet\b[^>]*\/>/g;
  let match;
  let rId = null;
  while ((match = sheetTagRe.exec(workbookXml))) {
    const tag = match[0];
    const nameMatch = /name="([^"]*)"/.exec(tag);
    const ridMatch = /r:id="(rId\d+)"/.exec(tag);
    if (nameMatch && ridMatch && nameMatch[1] === sheetName) {
      rId = ridMatch[1];
      break;
    }
  }
  if (!rId) throw new Error(`No se encontró la hoja "${sheetName}" en el workbook.`);

  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const relRe = new RegExp(`<Relationship\\b[^>]*Id="${rId}"[^>]*/>`);
  const relTag = relRe.exec(workbookRelsXml)?.[0];
  if (!relTag) throw new Error(`No se encontró la relación ${rId} del workbook.`);
  const targetMatch = /Target="([^"]+)"/.exec(relTag);
  if (!targetMatch) throw new Error(`La relación ${rId} no tiene Target.`);
  return `xl/${targetMatch[1].replace(/^\.?\//, "")}`;
}

// --- gráfico de línea (Curva S) -----------------------------------------------------------

function buildLineSeriesXml(ser, idx) {
  const color = String(ser.color || "4FA8D8").replace(/^#/, "").toUpperCase();
  const values = ser.values || [];
  // OJO: null/undefined significan "sin dato todavía" (ej. avance real después de la fecha de
  // corte) y NO deben escribirse como 0 — eso dibujaría una línea plana en cero. Se omite el
  // <c:pt> de ese índice por completo, así Excel lo trata como celda en blanco (hueco en la línea).
  const cache = values
    .map((v, i) => (v === null || v === undefined ? "" : `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`))
    .join("");

  // Dos modos: referencia a celdas de la propia hoja (categoriesRef/valuesRef, con caché para
  // compatibilidad) o datos LITERALES embebidos en el gráfico (categories/values, sin necesitar
  // una tabla de respaldo en ninguna hoja) — útil cuando el gráfico no tiene una hoja de datos propia.
  const catXml = ser.categoriesRef
    ? `<c:strRef><c:f>${xmlEscape(ser.categoriesRef)}</c:f></c:strRef>`
    : `<c:strLit><c:ptCount val="${(ser.categories || []).length}"/>${(ser.categories || []).map((c, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(c)}</c:v></c:pt>`).join("")}</c:strLit>`;
  const valXml = ser.valuesRef
    ? `<c:numRef><c:f>${xmlEscape(ser.valuesRef)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${cache}</c:numCache></c:numRef>`
    : `<c:numLit><c:ptCount val="${values.length}"/>${cache}</c:numLit>`;

  return `
    <c:ser>
      <c:idx val="${idx}"/>
      <c:order val="${idx}"/>
      <c:tx><c:v>${xmlEscape(ser.name)}</c:v></c:tx>
      <c:spPr>
        <a:ln w="28575"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>
      </c:spPr>
      <c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:marker>
      <c:cat>${catXml}</c:cat>
      <c:val>${valXml}</c:val>
      <c:smooth val="0"/>
    </c:ser>`;
}

function buildLineChartXml({ title, series }) {
  const seriesXml = series.map((s, i) => buildLineSeriesXml(s, i)).join("");
  // Con muchos puntos (ej. una fecha por hito) el eje de categorías se vuelve ilegible si se
  // muestran todas las etiquetas — se rotan 45° y se salta de a varias para que quepan.
  const nPoints = Math.max(...series.map((s) => (s.values || []).length), 0);
  const tickSkip = nPoints > 15 ? Math.ceil(nPoints / 15) : 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-CO" sz="1200" b="1"/><a:t>${xmlEscape(title)}</a:t></a:r></a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:marker val="1"/>
        <c:axId val="111111111"/>
        <c:axId val="222222222"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="111111111"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:txPr><a:bodyPr rot="-2700000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="700"/></a:pPr><a:endParaRPr lang="es-CO"/></a:p></c:txPr>
        <c:crossAx val="222222222"/>
        <c:tickLblSkip val="${tickSkip}"/>
        <c:tickMarkSkip val="${tickSkip}"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="222222222"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:numFmt formatCode="0.0&quot;%&quot;" sourceLinked="0"/>
        <c:crossAx val="111111111"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`;
}

// --- gráfico de torta (Estado de inversiones / Eficiencia del costo) ---------------------

function buildPieChartXml({ title, slices }) {
  // slices: [{ name, value, color }] — usa valores/categorías LITERALES en el XML (no referencia
  // celdas): son porcentajes derivados que no necesitan su propia tabla en la hoja.
  const dPts = slices
    .map((s, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${String(s.color).replace(/^#/, "").toUpperCase()}"/></a:solidFill></c:spPr></c:dPt>`)
    .join("");
  const catPts = slices.map((s, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(s.name)}</c:v></c:pt>`).join("");
  const valPts = slices.map((s, i) => `<c:pt idx="${i}"><c:v>${Number(s.value) || 0}</c:v></c:pt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:t>${xmlEscape(title)}</a:t></a:r></a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          ${dPts}
          <c:dLbls>
            <c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/>
            <c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/>
          </c:dLbls>
          <c:cat><c:strLit><c:ptCount val="${slices.length}"/>${catPts}</c:strLit></c:cat>
          <c:val><c:numLit><c:ptCount val="${slices.length}"/>${valPts}</c:numLit></c:val>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

// --- anclaje del gráfico en la hoja (drawing) --------------------------------------------

// Si se pasa `toCell`, el gráfico se estira para llenar ese rango de celdas (twoCellAnchor).
// Si se pasa `extEmu` ({cx, cy} en EMU — 914400 EMU = 1 pulgada), el gráfico queda con un
// tamaño FIJO anclado en `fromCell` (oneCellAnchor) — así se ve igual sin importar el ancho/alto
// de las columnas/filas de esa hoja, que es como está anclado el informe real.
function buildAnchorXml({ fromCell, toCell, extEmu, chartRelId, anchorId }) {
  const from = cellRefToColRow(fromCell);
  const graphicFrame = `<xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${anchorId}" name="Chart ${anchorId}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRelId}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>`;

  if (toCell) {
    const to = cellRefToColRow(toCell);
    return `<xdr:twoCellAnchor>
    <xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    ${graphicFrame}
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
  }

  return `<xdr:oneCellAnchor>
    <xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:ext cx="${extEmu.cx}" cy="${extEmu.cy}"/>
    ${graphicFrame}
    <xdr:clientData/>
  </xdr:oneCellAnchor>`;
}

const EMPTY_DRAWING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></xdr:wsDr>`;

// Agrega un gráfico (línea o torta) a una hoja ya existente del workbook. Si la hoja ya tiene otro
// gráfico, este se agrega al mismo drawing (varios gráficos pueden compartir una hoja, como en Excel).
//   xlsxBuffer: buffer/arraybuffer del .xlsx (de wb.xlsx.writeBuffer() de ExcelJS)
//   opts.sheetName / opts.fromCell: dónde va el gráfico. Además, o bien opts.toCell (se estira para
//     llenar ese rango de celdas) o bien opts.extEmu:{cx,cy} (tamaño fijo en EMU, 914400 = 1 pulgada,
//     sin importar el ancho/alto de esa hoja — usar esto para calcar el tamaño exacto de un gráfico
//     de un archivo real).
//   opts.type: "line" | "pie"
//   opts.title: título del gráfico
//   opts.series (line): [{ name, color, ...datos }] — datos es o bien { categoriesRef, valuesRef,
//     values } (referencia celdas de esa hoja, con values como caché) o bien { categories, values }
//     (datos literales embebidos, sin necesitar una hoja de respaldo).
//   opts.slices (pie): [{ name, value, color }]
// Devuelve un nuevo buffer (Uint8Array). Se puede encadenar sobre el resultado anterior para agregar
// varios gráficos, en la misma hoja o en hojas distintas.
async function addChart(xlsxBuffer, opts) {
  const { sheetName, fromCell, toCell, extEmu, title, type } = opts;
  const zip = await JSZip.loadAsync(xlsxBuffer);

  const sheetPath = await findSheetPath(zip, sheetName);
  const sheetFile = sheetPath.split("/").pop();
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`;

  const chartIdx = nextIndex(zip, "xl/charts", "chart", "xml");
  const chartPath = `xl/charts/chart${chartIdx}.xml`;
  const chartXml = type === "pie" ? buildPieChartXml({ title, slices: opts.slices }) : buildLineChartXml({ title, series: opts.series });
  zip.file(chartPath, chartXml);

  const sheetXml = await zip.file(sheetPath).async("string");
  const existingDrawingMatch = /<drawing r:id="(rId\d+)"\s*\/>/.exec(sheetXml);

  let drawingPath, drawingRelsPath, drawingRelId;
  if (existingDrawingMatch) {
    // Ya hay un drawing en esta hoja: le agregamos el nuevo gráfico como otra ancla.
    const existingSheetRels = await zip.file(sheetRelsPath).async("string");
    const relRe = new RegExp(`<Relationship\\b[^>]*Id="${existingDrawingMatch[1]}"[^>]*/>`);
    const target = /Target="([^"]+)"/.exec(relRe.exec(existingSheetRels)?.[0] || "")?.[1];
    if (!target) throw new Error(`No se encontró el drawing de la hoja "${sheetName}".`);
    drawingPath = `xl/drawings/${target.split("/").pop()}`;
    drawingRelsPath = `xl/drawings/_rels/${drawingPath.split("/").pop()}.rels`;
    drawingRelId = existingDrawingMatch[1];
  } else {
    const drawingIdx = nextIndex(zip, "xl/drawings", "drawing", "xml");
    drawingPath = `xl/drawings/drawing${drawingIdx}.xml`;
    drawingRelsPath = `xl/drawings/_rels/drawing${drawingIdx}.xml.rels`;
    zip.file(drawingPath, EMPTY_DRAWING);
    zip.file(drawingRelsPath, relsXml([]));

    const existingSheetRels = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath).async("string") : null;
    drawingRelId = nextRelId(existingSheetRels);
    if (existingSheetRels) {
      zip.file(sheetRelsPath, existingSheetRels.replace(
        "</Relationships>",
        `<Relationship Id="${drawingRelId}" Type="${REL_DRAWING}" Target="../drawings/${drawingPath.split("/").pop()}"/></Relationships>`
      ));
    } else {
      zip.file(sheetRelsPath, relsXml([{ id: drawingRelId, type: REL_DRAWING, target: `../drawings/${drawingPath.split("/").pop()}` }]));
    }

    const sheetXmlWithDrawing = sheetXml.replace("</worksheet>", `<drawing r:id="${drawingRelId}"/></worksheet>`);
    zip.file(sheetPath, sheetXmlWithDrawing);

    const contentTypesXml = await zip.file("[Content_Types].xml").async("string");
    zip.file("[Content_Types].xml", contentTypesXml.replace(
      "</Types>",
      `<Override PartName="/${drawingPath}" ContentType="${CT_DRAWING}"/></Types>`
    ));
  }

  const drawingRelsXml = await zip.file(drawingRelsPath).async("string");
  const chartRelId = nextRelId(drawingRelsXml);
  zip.file(drawingRelsPath, drawingRelsXml.replace(
    "</Relationships>",
    `<Relationship Id="${chartRelId}" Type="${REL_CHART}" Target="../charts/chart${chartIdx}.xml"/></Relationships>`
  ));

  const drawingXml = await zip.file(drawingPath).async("string");
  const anchorId = chartIdx + 1; // cNvPr id solo necesita ser único dentro del drawing; chartIdx ya es único a nivel de archivo
  const anchorXml = buildAnchorXml({ fromCell, toCell, extEmu, chartRelId, anchorId });
  zip.file(drawingPath, drawingXml.replace("</xdr:wsDr>", `${anchorXml}</xdr:wsDr>`));

  const contentTypesXml2 = await zip.file("[Content_Types].xml").async("string");
  zip.file("[Content_Types].xml", contentTypesXml2.replace(
    "</Types>",
    `<Override PartName="/${chartPath}" ContentType="${CT_CHART}"/></Types>`
  ));

  return zip.generateAsync({ type: "uint8array" });
}

function addLineChart(xlsxBuffer, opts) {
  return addChart(xlsxBuffer, { ...opts, type: "line" });
}

function addPieChart(xlsxBuffer, opts) {
  return addChart(xlsxBuffer, { ...opts, type: "pie" });
}

export { addLineChart, addPieChart, cellRefToColRow, quoteSheetName };
