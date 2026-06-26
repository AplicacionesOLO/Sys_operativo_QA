-- ===========================================================================
-- Elimina el filtro "mes IS NULL" de las funciones de slots
-- Razón: el módulo de upload ahora hace replace-all (borra todo, inserta con
--        mes=null). No hay periodos múltiples, el campo mes ya no se usa.
--        Con este filtro, datos subidos antes del cambio de upload strategy
--        quedan invisible para estas funciones.
--
-- INSTRUCCIONES:
-- 1. Ir a Supabase → SQL Editor
-- 2. Pegar y ejecutar este script
-- 3. Verificar en Costos Almacén que los costos por slot aparecen correctamente
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. fn_slot_stats_por_ubicacion
--    Busca en la consola de Supabase → Database → Functions → esta función
--    y reemplaza el bloque WHERE que tenga "AND mes IS NULL" por sin esa línea.
--
--    El patrón a buscar en el cuerpo de la función es algo así:
--      WHERE raw_data->>'Ubicación' = p_ubicacion
--        AND mes IS NULL           <-- ELIMINAR esta línea
--
--    Si la función tiene este formato, ejecuta el CREATE OR REPLACE completo.
--    Ajusta según el SQL real que veas en Supabase.
-- ---------------------------------------------------------------------------

-- Ejemplo de recreación (ajusta el cuerpo exacto al que ves en Supabase):
/*
CREATE OR REPLACE FUNCTION public.fn_slot_stats_por_ubicacion(p_ubicacion text)
RETURNS TABLE(
  zona_almacenaje text,
  tipo_ubicacion  text,
  dimension       text,
  total           bigint,
  libres          bigint,
  bloqueados      bigint,
  reservados      bigint,
  otros           bigint,
  pct_libres      numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    raw_data->>'Zona Almacenaje'  AS zona_almacenaje,
    raw_data->>'Tipo Ubicación'   AS tipo_ubicacion,
    raw_data->>'Dimensión'        AS dimension,
    COUNT(*)                      AS total,
    COUNT(*) FILTER (WHERE raw_data->>'Estado' = 'L') AS libres,
    COUNT(*) FILTER (WHERE raw_data->>'Estado' = 'B') AS bloqueados,
    COUNT(*) FILTER (WHERE raw_data->>'Estado' = 'R') AS reservados,
    COUNT(*) FILTER (WHERE raw_data->>'Estado' NOT IN ('L','B','R')) AS otros,
    ROUND(COUNT(*) FILTER (WHERE raw_data->>'Estado' = 'L') * 100.0 / NULLIF(COUNT(*),0), 2) AS pct_libres
  FROM public.conteo_slots_raw
  WHERE raw_data->>'Ubicación' = p_ubicacion
  -- SIN "AND mes IS NULL"
  GROUP BY 1, 2, 3;
$$;
*/

-- ---------------------------------------------------------------------------
-- 2. fn_slot_tipo_dim_stats
--    Busca en el cuerpo de la función la línea "AND mes IS NULL" y elimínala.
--
--    El patrón a buscar:
--      WHERE raw_data->>'Zona Almacenaje' = ANY(p_zonas_almacenaje)
--        AND mes IS NULL           <-- ELIMINAR esta línea
-- ---------------------------------------------------------------------------

-- Ejemplo de recreación (ajusta el cuerpo exacto al que ves en Supabase):
/*
CREATE OR REPLACE FUNCTION public.fn_slot_tipo_dim_stats(p_zonas_almacenaje text[])
RETURNS TABLE(
  zona_almacenaje text,
  tipo_ubicacion  text,
  dimension       text,
  total           bigint,
  libres          bigint,
  bloqueados      bigint,
  reservados      bigint,
  otros           bigint,
  zona_total      bigint,
  pct_zona        numeric,
  pct_libres      numeric
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT
      raw_data->>'Zona Almacenaje' AS zona_almacenaje,
      raw_data->>'Tipo Ubicación'  AS tipo_ubicacion,
      raw_data->>'Dimensión'       AS dimension,
      raw_data->>'Estado'          AS estado
    FROM public.conteo_slots_raw
    WHERE raw_data->>'Zona Almacenaje' = ANY(p_zonas_almacenaje)
    -- SIN "AND mes IS NULL"
  ),
  agg AS (
    SELECT zona_almacenaje, tipo_ubicacion, dimension,
      COUNT(*)                                  AS total,
      COUNT(*) FILTER (WHERE estado = 'L')      AS libres,
      COUNT(*) FILTER (WHERE estado = 'B')      AS bloqueados,
      COUNT(*) FILTER (WHERE estado = 'R')      AS reservados,
      COUNT(*) FILTER (WHERE estado NOT IN ('L','B','R')) AS otros
    FROM base GROUP BY 1, 2, 3
  ),
  ztot AS (
    SELECT zona_almacenaje, SUM(total) AS zona_total FROM agg GROUP BY 1
  )
  SELECT a.*, z.zona_total,
    ROUND(a.total * 100.0 / NULLIF(z.zona_total,0), 2) AS pct_zona,
    ROUND(a.libres * 100.0 / NULLIF(a.total,0), 2)     AS pct_libres
  FROM agg a JOIN ztot z USING (zona_almacenaje);
$$;
*/

-- ---------------------------------------------------------------------------
-- FORMA RÁPIDA (si no sabes el cuerpo exacto):
-- Ir a Supabase → Database → Functions → busca cada función
-- Haz clic en "Edit" → en el SQL verás "AND mes IS NULL" → bórrala → Save
-- ---------------------------------------------------------------------------
