import "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 5000;

interface ArticuloResumen {
  articulo: string;
  descripcion: string;
  movimientos: number;
  unidades: number;
  meses_distintos: number;
  prom_movimientos_mes: number;
  prom_unidades_mes: number;
}

interface ZonaResumen {
  zona: string;
  movimientos: number;
  unidades: number;
  articulos_distintos: number;
  meses_distintos: number;
  prom_movimientos_mes: number;
  prom_unidades_mes: number;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(supabaseClient, supabaseKey);

    // ── Paso 1: Contar total ──
    const { count: totalRows, error: countErr } = await supabase
      .from("volumenes_raw")
      .select("*", { count: "exact", head: true });

    if (countErr) throw countErr;
    if (!totalRows || totalRows === 0) {
      return new Response(
        JSON.stringify({ articulos: [], zonas: [], totalRows: 0, mensaje: "Sin datos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mapas de agregación ──
    const articuloMap = new Map<string, {
      articulo: string;
      descripcion: string;
      movimientos: number;
      unidades: number;
      meses: Set<string>;
    }>();

    const zonaMap = new Map<string, {
      zona: string;
      movimientos: number;
      unidades: number;
      articulos: Set<string>;
      meses: Set<string>;
    }>();

    const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
    let totalProcesados = 0;
    let rowsSinArticulo = 0;

    for (let b = 0; b < totalBatches; b++) {
      const from = b * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;

      const { data: chunk, error: chunkErr } = await supabase
        .from("volumenes_raw")
        .select("raw_data")
        .order("created_at", { ascending: true })
        .range(from, to);

      if (chunkErr) throw chunkErr;
      if (!chunk) continue;

      for (const row of chunk) {
        const rd = row.raw_data as Record<string, unknown> | null;
        if (!rd || typeof rd !== "object") continue;

        const articuloRaw = rd["Artículo"];
        const articulo = (articuloRaw !== null && articuloRaw !== undefined) ? String(articuloRaw).trim() : "";
        const descripcion = String(rd["DESCRIPCIONLARGA"] ?? "").trim();
        const cantidadRaw = rd["Cantidad"];
        const unidades = typeof cantidadRaw === "number" ? cantidadRaw : (Number(cantidadRaw) || 0);

        // Extraer mes de Fecha Generación
        const fechaRaw = String(rd["Fecha Generación"] ?? "");
        const mes = fechaRaw.length >= 7 ? fechaRaw.substring(0, 7) : "sin-fecha";

        // Extraer zona
        const zonaRaw = rd["Zona Picking"];
        const zona = (zonaRaw !== null && zonaRaw !== undefined) ? String(zonaRaw).trim() : "Sin zona";

        totalProcesados++;

        // ── Agregación por artículo ──
        const artKey = articulo || "__sin_articulo__";
        const artLabel = articulo || "Sin artículo";

        const artExisting = articuloMap.get(artKey);
        if (artExisting) {
          artExisting.movimientos += 1;
          artExisting.unidades += unidades;
          artExisting.meses.add(mes);
          if (!articulo) artExisting.articulo = artLabel;
        } else {
          articuloMap.set(artKey, {
            articulo: artLabel,
            descripcion: descripcion || "—",
            movimientos: 1,
            unidades,
            meses: new Set([mes]),
          });
        }

        if (!articulo) rowsSinArticulo++;

        // ── Agregación por zona ──
        const zonaExisting = zonaMap.get(zona);
        if (zonaExisting) {
          zonaExisting.movimientos += 1;
          zonaExisting.unidades += unidades;
          zonaExisting.articulos.add(articulo || "__sin_articulo__");
          zonaExisting.meses.add(mes);
        } else {
          zonaMap.set(zona, {
            zona,
            movimientos: 1,
            unidades,
            articulos: new Set([articulo || "__sin_articulo__"]),
            meses: new Set([mes]),
          });
        }
      }
    }

    // ── Construir resultados ──
    const articulos: ArticuloResumen[] = [];
    for (const item of articuloMap.values()) {
      const nMeses = item.meses.size || 1;
      articulos.push({
        articulo: item.articulo,
        descripcion: item.descripcion,
        movimientos: item.movimientos,
        unidades: Math.round(item.unidades * 100) / 100,
        meses_distintos: nMeses,
        prom_movimientos_mes: Math.round((item.movimientos / nMeses) * 100) / 100,
        prom_unidades_mes: Math.round((item.unidades / nMeses) * 100) / 100,
      });
    }
    articulos.sort((a, b) => b.movimientos - a.movimientos);

    // Verificar consistencia
    const totalMovArticulos = articulos.reduce((s, r) => s + r.movimientos, 0);

    const zonas: ZonaResumen[] = [];
    for (const item of zonaMap.values()) {
      const nMeses = item.meses.size || 1;
      zonas.push({
        zona: item.zona,
        movimientos: item.movimientos,
        unidades: Math.round(item.unidades * 100) / 100,
        articulos_distintos: item.articulos.size,
        meses_distintos: nMeses,
        prom_movimientos_mes: Math.round((item.movimientos / nMeses) * 100) / 100,
        prom_unidades_mes: Math.round((item.unidades / nMeses) * 100) / 100,
      });
    }
    zonas.sort((a, b) => b.movimientos - a.movimientos);

    const totalMovZonas = zonas.reduce((s, r) => s + r.movimientos, 0);

    return new Response(
      JSON.stringify({
        articulos,
        zonas,
        totalRows,
        totalProcesados,
        totalMovArticulos,
        totalMovZonas,
        totalArticulos: articulos.length,
        totalZonas: zonas.length,
        rowsSinArticulo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
