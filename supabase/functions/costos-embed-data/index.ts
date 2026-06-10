import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Simple CORS headers for embedded iframe ────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Service role client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const promises = [
      supabase.from("costos_columnas").select("*").order("orden"),
      supabase.from("costos_operacion").select("*").order("orden"),
      supabase.from("areas").select("id, nombre, metros_cuadrados, cantidad_racks, metros_cubicos, categoria, costo_area, costo_area_formula").order("nombre"),
      supabase.from("inversiones").select("*").order("created_at"),
      supabase.from("gastos_varios_columnas").select("id, nombre, tipo").order("orden"),
      supabase.from("gastos_varios").select("id, area, concepto, parent_id, es_total, tipo_fila, valores"),
      supabase.from("area_distribution").select("area_name, global_distribution_percentage"),
      supabase.from("mano_obra_columnas").select("id, nombre, tipo, is_sensitive").order("orden"),
      supabase.from("mano_obra").select("id, area, valores"),
      supabase.from("volumenes_columnas").select("id, nombre, tipo").order("orden"),
      supabase.from("volumenes").select("id, proceso, subproceso, valores"),
      supabase.from("mano_obra_empleados").select("*").eq("is_active", true),
      supabase.from("volumen_distribucion").select("id, nombre, porcentaje, porcentaje_inbound, porcentaje_outbound, categoria, is_active, unidades, es_zona_franca").eq("is_active", true).order("orden"),
      supabase.from("factores").select("*"),
      supabase.rpc("fn_volumenes_zona_resumen_v2"),
      supabase.rpc("fn_volumenes_totales"),
    ];

    const [
      { data: colData },
      { data: filData },
      { data: areasData },
      { data: invData },
      { data: gastosColData },
      { data: gastosFilData },
      { data: areaDistribData },
      { data: moColData },
      { data: moFilData },
      { data: volColData },
      { data: volFilData },
      { data: empData },
      { data: volDistData },
      { data: factoresData },
      { data: masivoZonData },
      { data: masivoTotales },
    ] = await Promise.all(promises as any);

    // Paginated fetch for articulo_resumen (can exceed Supabase default 1000-row limit)
    const MASIVO_PAGE = 1000;
    let masivoArtData: any[] = [];
    let mOffset = 0;
    while (true) {
      const { data: page } = await supabase.rpc("fn_volumenes_articulo_resumen_v3", { p_offset: mOffset, p_limit: MASIVO_PAGE });
      if (!page || page.length === 0) break;
      masivoArtData = masivoArtData.concat(page);
      if (page.length < MASIVO_PAGE) break;
      mOffset += MASIVO_PAGE;
    }

    const lastN = { recibido: 0, despachado: 0 };
    try {
      const raw = await supabase.storage
        .from("config")
        .download("vol_promedio_lastN.json");
      if (raw.data) {
        const text = await raw.data.text();
        const parsed = JSON.parse(text);
        if (typeof parsed.recibido === "number") lastN.recibido = parsed.recibido;
        if (typeof parsed.despachado === "number") lastN.despachado = parsed.despachado;
      }
    } catch {
      // ignore missing config file
    }

    return new Response(
      JSON.stringify({
        colData,
        filData,
        areasData,
        invData,
        gastosColData,
        gastosFilData,
        areaDistribData,
        moColData,
        moFilData,
        volColData,
        volFilData,
        empData,
        volDistData,
        factoresData,
        masivoArtData,
        masivoZonData,
        masivoTotales,
        volLastN: lastN,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
