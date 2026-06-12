import json, urllib.request

BASE = "https://api.supabase.com/v1/projects/jnbhebbfkrmmsytilgnz/database/query"
TOKEN = "YOUR_SUPABASE_PAT_HERE"  # Supabase → Account → Access Tokens

def run_sql(sql):
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(BASE, data=body, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return r.read().decode()

# fn_movimientos_totales
print(run_sql("""
CREATE OR REPLACE FUNCTION fn_movimientos_totales()
RETURNS TABLE(total_articulos BIGINT, total_movimientos BIGINT, total_unidades NUMERIC, total_zonas BIGINT, total_mov_zonas BIGINT, total_unid_zonas NUMERIC)
LANGUAGE sql AS $$
  SELECT
    COUNT(DISTINCT raw_data->>'Artículo')::BIGINT AS total_articulos,
    COUNT(*)::BIGINT AS total_movimientos,
    SUM(CASE WHEN raw_data->>'Cantidad' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_data->>'Cantidad')::NUMERIC ELSE 1 END) AS total_unidades,
    COUNT(DISTINCT NULLIF(TRIM(raw_data->>'Zona Almacenaje'), ''))::BIGINT AS total_zonas,
    COUNT(*)::BIGINT AS total_mov_zonas,
    SUM(CASE WHEN raw_data->>'Cantidad' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_data->>'Cantidad')::NUMERIC ELSE 1 END) AS total_unid_zonas
  FROM costos_movimientos_raw;
$$;
"""))

# fn_movimientos_articulo_resumen
print(run_sql("""
CREATE OR REPLACE FUNCTION fn_movimientos_articulo_resumen(p_offset INT DEFAULT 0, p_limit INT DEFAULT 1000)
RETURNS TABLE(articulo TEXT, descripcion TEXT, movimientos BIGINT, unidades NUMERIC, meses_distintos BIGINT, prom_movimientos_mes NUMERIC, prom_unidades_mes NUMERIC)
LANGUAGE sql AS $$
  SELECT
    raw_data->>'Artículo' AS articulo,
    MAX(raw_data->>'DESCRIPCIONLARGA') AS descripcion,
    COUNT(*)::BIGINT AS movimientos,
    SUM(CASE WHEN raw_data->>'Cantidad' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_data->>'Cantidad')::NUMERIC ELSE 1 END) AS unidades,
    0::BIGINT AS meses_distintos,
    0::NUMERIC AS prom_movimientos_mes,
    0::NUMERIC AS prom_unidades_mes
  FROM costos_movimientos_raw
  WHERE raw_data->>'Artículo' IS NOT NULL AND raw_data->>'Artículo' != ''
  GROUP BY raw_data->>'Artículo'
  ORDER BY movimientos DESC
  OFFSET p_offset LIMIT p_limit;
$$;
"""))

# fn_movimientos_zona_resumen
print(run_sql("""
CREATE OR REPLACE FUNCTION fn_movimientos_zona_resumen()
RETURNS TABLE(zona TEXT, movimientos BIGINT, unidades NUMERIC, articulos_distintos BIGINT, meses_distintos BIGINT, prom_movimientos_mes NUMERIC, prom_unidades_mes NUMERIC)
LANGUAGE sql AS $$
  SELECT
    COALESCE(NULLIF(TRIM(raw_data->>'Zona Almacenaje'), ''), 'Sin Zona') AS zona,
    COUNT(*)::BIGINT AS movimientos,
    SUM(CASE WHEN raw_data->>'Cantidad' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_data->>'Cantidad')::NUMERIC ELSE 1 END) AS unidades,
    COUNT(DISTINCT raw_data->>'Artículo')::BIGINT AS articulos_distintos,
    0::BIGINT AS meses_distintos,
    0::NUMERIC AS prom_movimientos_mes,
    0::NUMERIC AS prom_unidades_mes
  FROM costos_movimientos_raw
  WHERE raw_data->>'Zona Almacenaje' IS NOT NULL AND TRIM(raw_data->>'Zona Almacenaje') != ''
  GROUP BY 1
  ORDER BY movimientos DESC;
$$;
"""))

# fn_movimientos_zona_compania_articulo
print(run_sql("""
CREATE OR REPLACE FUNCTION fn_movimientos_zona_compania_articulo(p_zona TEXT, p_offset INT DEFAULT 0, p_limit INT DEFAULT 1000)
RETURNS TABLE(zona TEXT, id_compania TEXT, articulo TEXT, descripcion TEXT, movimientos BIGINT, unidades NUMERIC)
LANGUAGE sql AS $$
  SELECT
    COALESCE(NULLIF(TRIM(raw_data->>'Zona Almacenaje'), ''), 'Sin Zona') AS zona,
    COALESCE(raw_data->>'Id Compañía', '') AS id_compania,
    raw_data->>'Artículo' AS articulo,
    MAX(raw_data->>'DESCRIPCIONLARGA') AS descripcion,
    COUNT(*)::BIGINT AS movimientos,
    SUM(CASE WHEN raw_data->>'Cantidad' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_data->>'Cantidad')::NUMERIC ELSE 1 END) AS unidades
  FROM costos_movimientos_raw
  WHERE COALESCE(NULLIF(TRIM(raw_data->>'Zona Almacenaje'), ''), 'Sin Zona') = p_zona
    AND raw_data->>'Artículo' IS NOT NULL AND raw_data->>'Artículo' != ''
  GROUP BY 1, 2, raw_data->>'Artículo'
  ORDER BY movimientos DESC
  OFFSET p_offset LIMIT p_limit;
$$;
"""))

# fn_movimientos_zona_articulo_mensual
print(run_sql("""
CREATE OR REPLACE FUNCTION fn_movimientos_zona_articulo_mensual(p_zona TEXT, p_offset INT DEFAULT 0, p_limit INT DEFAULT 1000)
RETURNS TABLE(zona TEXT, id_compania TEXT, articulo TEXT, descripcion TEXT, mes INT, mes_nombre TEXT, movimientos BIGINT, unidades NUMERIC)
LANGUAGE sql AS $$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(TRIM(raw_data->>'Zona Almacenaje'), ''), 'Sin Zona') AS zona,
      COALESCE(raw_data->>'Id Compañía', '') AS id_compania,
      raw_data->>'Artículo' AS articulo,
      raw_data->>'DESCRIPCIONLARGA' AS desc_raw,
      CASE
        WHEN raw_data->>'Fecha Generación' ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN EXTRACT(MONTH FROM (raw_data->>'Fecha Generación')::DATE)::INT
        ELSE NULL
      END AS mes_num,
      CASE WHEN raw_data->>'Cantidad' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_data->>'Cantidad')::NUMERIC ELSE 1 END AS cantidad
    FROM costos_movimientos_raw
    WHERE COALESCE(NULLIF(TRIM(raw_data->>'Zona Almacenaje'), ''), 'Sin Zona') = p_zona
      AND raw_data->>'Artículo' IS NOT NULL AND raw_data->>'Artículo' != ''
  )
  SELECT
    zona, id_compania, articulo,
    MAX(desc_raw) AS descripcion,
    mes_num AS mes,
    TO_CHAR(TO_DATE(mes_num::TEXT, 'MM'), 'Mon') AS mes_nombre,
    COUNT(*)::BIGINT AS movimientos,
    SUM(cantidad) AS unidades
  FROM base
  WHERE mes_num IS NOT NULL
  GROUP BY zona, id_compania, articulo, mes_num
  ORDER BY articulo, mes_num
  OFFSET p_offset LIMIT p_limit;
$$;
"""))

print("ALL DONE")
