// Helpers puros para el informe semanal PP-I-01 (control presupuestal y cronograma de proyectos).
// Sin React, sin ExcelJS: solo combinan datos que ya existen en data.js en la forma exacta que
// necesita el reporte, para que el exportador Excel y el exportador PDF partan de la misma fuente
// y no diverjan entre sí.
import {
  balanceMargenTotals,
  buildEnergizacionCurvaSData,
  buildCurvaSData,
  buildCortesObra,
  energizacionFpoFecha,
  emptyProyectoInfoState,
  addMonths,
  pagosTotals,
  todayISO,
} from "./data.js";

// Busca el punto de la curva S justo en cutoffDate (siempre está, se agrega explícito al armar la
// curva); si por algún motivo no está, cae al último punto con avance real no nulo.
function cumplimientoEnCorte(curva, cutoffDate) {
  return curva.find((p) => p.date === cutoffDate) || [...curva].reverse().find((p) => p.real !== null) || null;
}

// "Municipio, Departamento" (como se guarda project.location) separado en sus dos partes, sin
// validar contra el listado de municipios — solo para mostrar en el informe. Si no calza ese
// formato, se deja completo en "municipio" y "departamento" vacío.
function splitUbicacion(location) {
  const parts = String(location || "").split(",").map((s) => s.trim());
  if (parts.length >= 2 && parts[0] && parts[1]) return { municipio: parts[0], departamento: parts[1] };
  return { municipio: parts[0] || "", departamento: "" };
}

// FPO sin extensión / con extensión: para proyectos ≤1MW son 6 y 9 meses desde "Día 0" (la extensión
// es la prórroga de 3 meses). Para >1MW no aplica esa distinción (fpoManual es una sola fecha, el
// trámite ante el CND no sigue la regla de meses) — se muestra la misma fecha en ambos campos.
function fpoSinYConExtension(ener) {
  const esMayor1mw = ener?.tipo === "mayor1mw";
  if (esMayor1mw) {
    const fpo = ener?.fpoManual || null;
    return { fpoSinExtension: fpo, fpoConExtension: fpo };
  }
  if (!ener?.fechaInicio) return { fpoSinExtension: null, fpoConExtension: null };
  return { fpoSinExtension: addMonths(ener.fechaInicio, 6), fpoConExtension: addMonths(ener.fechaInicio, 9) };
}

// Costo estimado inicial = presupuesto BASE. Costo proyectado = presupuesto EJECUCIÓN. EBITDA =
// valor contractual - costo proyectado (balanceMargenTotals ya lo calcula como "utilidadReal").
// Eficiencia del costo = costo estimado inicial / costo proyectado (fracción, ej. 0.94 = 94%).
// Ganancia o pérdida = 1 - eficiencia del costo (también fracción/%, NO es el mismo número que
// EBITDA — son dos métricas distintas). Verificado contra las fórmulas reales del informe PP-I-01
// (columna F, hoja INFO BASE: F47=D46/F46, F48=1-F47).
function reporteFinancieroTotals(balance, presupuesto) {
  const margen = balanceMargenTotals(balance, presupuesto);
  const costoEstimadoInicial = margen.presupuestoBase;
  const costoProyectado = margen.presupuestoEjecucion;
  const ebitda = margen.utilidadReal;
  const eficienciaCosto = costoProyectado ? costoEstimadoInicial / costoProyectado : 0;
  return {
    valorContractual: margen.valorVenta,
    costoEstimadoInicial,
    costoProyectado,
    ebitda,
    eficienciaCosto,
    gananciaPerdida: 1 - eficienciaCosto,
  };
}

// Arma todo lo que necesita una "página" del informe para un proyecto, a partir del project row
// (id/name/capacity/location) y su project_data completo.
// cutoffDate: fecha de corte del avance real de la curva S de energización (por defecto, hoy) —
// para exportar un informe de un periodo pasado sin que el avance real se "adelante" con datos
// cargados después de esa fecha. La línea base no se corta.
function buildInformeProyecto(project, data, cutoffDate = todayISO()) {
  const info = data?.info || emptyProyectoInfoState();
  const financiero = reporteFinancieroTotals(data?.balance, data?.presupuesto);
  const curvaSEnergizacion = buildEnergizacionCurvaSData(data?.energizacion, cutoffDate);
  const curvaSSeguimiento = data?.cronograma ? buildCurvaSData(data.cronograma, cutoffDate) : [];
  const cortesObra = buildCortesObra(data?.pagos, info.cortesObra);
  const cumplimientoEnergizacion = cumplimientoEnCorte(curvaSEnergizacion, cutoffDate);
  const cumplimientoSeguimiento = cumplimientoEnCorte(curvaSSeguimiento, cutoffDate);
  const { fpoSinExtension, fpoConExtension } = fpoSinYConExtension(data?.energizacion);
  const inversiones = pagosTotals(data?.pagos);

  return {
    projectId: project?.id,
    nombre: project?.name || "",
    codigo: project?.code || "",
    potencia: project?.capacity || "",
    ubicacion: project?.location || "",
    ...splitUbicacion(project?.location),
    fpo: energizacionFpoFecha(data?.energizacion),
    fpoSinExtension,
    fpoConExtension,
    equipo: info.equipo,
    fichaTecnica: info.fichaTecnica,
    financiero,
    inversiones, // { totalOrdenes, totalPagado, totalProgramado, totalSaldo } — para la torta "Estado de inversiones"
    cortesObra,
    curvaSEnergizacion,
    cumplimientoEnergizacion,
    curvaSSeguimiento,
    cumplimientoSeguimiento,
    presupuestoEjecucion: data?.presupuesto?.ejecucion || [],
  };
}

export { reporteFinancieroTotals, buildInformeProyecto, splitUbicacion };
