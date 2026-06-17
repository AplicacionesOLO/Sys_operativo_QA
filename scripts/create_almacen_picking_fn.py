"""
Creates fn_picking_match_for_almacen RPC in Supabase.
Cross-references zona_picking_raw data into costos-almacen by Ubicación + Id Artículo + Id Compañía.
"""
import os, sys, json, urllib.request, urllib.error

PAT   = os.environ.get('SUPABASE_PAT', '')
PROJ  = 'jnbhebbfkrmmsytilgnz'

SQL = """
CREATE OR REPLACE FUNCTION fn_picking_match_for_almacen(p_ubicaciones text[])
RETURNS TABLE(
  ubicacion    text,
  id_articulo  text,
  id_compania  text,
  cant_maxima  numeric,
  cant_minima  numeric,
  pct_picking  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (
    raw_data->>'Ubicación',
    raw_data->>'Id Artículo',
    raw_data->>'Id Compañía'
  )
    (raw_data->>'Ubicación')::text   AS ubicacion,
    (raw_data->>'Id Artículo')::text AS id_articulo,
    (raw_data->>'Id Compañía')::text AS id_compania,
    COALESCE(
      NULLIF(REGEXP_REPLACE(COALESCE(raw_data->>'Cantidad Máxima', '0'), '[^0-9.-]', '', 'g'), '')::numeric,
      0
    )                                AS cant_maxima,
    COALESCE(
      NULLIF(REGEXP_REPLACE(COALESCE(raw_data->>'Cantidad Mínima', '0'), '[^0-9.-]', '', 'g'), '')::numeric,
      0
    )                                AS cant_minima,
    COALESCE(
      NULLIF(REGEXP_REPLACE(COALESCE(raw_data->>'% Picking', '0'), '[^0-9.-]', '', 'g'), '')::numeric,
      0
    )                                AS pct_picking
  FROM zona_picking_raw
  WHERE
    array_length(p_ubicaciones, 1) IS NULL
    OR raw_data->>'Ubicación' = ANY(p_ubicaciones)
  ORDER BY
    raw_data->>'Ubicación',
    raw_data->>'Id Artículo',
    raw_data->>'Id Compañía',
    anio  DESC NULLS LAST,
    mes   DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_picking_match_for_almacen(text[]) TO anon, authenticated;
"""

def run(sql: str):
    if not PAT:
        print("ERROR: Set SUPABASE_PAT env variable", file=sys.stderr)
        sys.exit(1)
    url  = f"https://api.supabase.com/v1/projects/{PROJ}/database/query"
    body = json.dumps({"query": sql}).encode()
    req  = urllib.request.Request(url, data=body, method="POST",
           headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            print("OK:", r.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP ERROR:", e.code, e.read().decode(), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    print("Creating fn_picking_match_for_almacen ...")
    run(SQL)
    print("Done.")
