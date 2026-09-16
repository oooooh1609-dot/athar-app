CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_reference_inscriptions(_q TEXT, _script TEXT DEFAULT NULL, _limit INTEGER DEFAULT 5)
RETURNS TABLE (
  siglum TEXT,
  script TEXT,
  language TEXT,
  transliteration TEXT,
  translation TEXT,
  site TEXT,
  url TEXT,
  source TEXT,
  similarity REAL
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT r.siglum, r.script, r.language, r.transliteration, r.translation, r.site, r.url, r.source,
         extensions.similarity(r.transliteration_plain, _q) AS similarity
  FROM public.reference_inscriptions r
  WHERE coalesce(btrim(_q), '') <> ''
    AND r.transliteration_plain IS NOT NULL
    AND (_script IS NULL OR r.script ILIKE '%' || _script || '%')
    AND r.transliteration_plain OPERATOR(extensions.%) _q
  ORDER BY extensions.similarity(r.transliteration_plain, _q) DESC
  LIMIT least(coalesce(_limit, 5), 20)
$$;

GRANT EXECUTE ON FUNCTION public.search_reference_inscriptions(TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;