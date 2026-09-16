CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.reference_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  license_note TEXT,
  source_url TEXT,
  records INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.reference_inscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID REFERENCES public.reference_collections(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  siglum TEXT NOT NULL,
  alt_sigla TEXT,
  script TEXT,
  language TEXT,
  transliteration TEXT,
  transliteration_plain TEXT,
  translation TEXT,
  site TEXT,
  provenance_notes TEXT,
  reference TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (source, siglum)
);

CREATE INDEX reference_inscriptions_plain_trgm ON public.reference_inscriptions USING gin (transliteration_plain gin_trgm_ops);
CREATE INDEX reference_inscriptions_script ON public.reference_inscriptions (script);

GRANT SELECT ON public.reference_collections TO anon, authenticated;
GRANT ALL ON public.reference_collections TO service_role;
GRANT SELECT ON public.reference_inscriptions TO anon, authenticated;
GRANT ALL ON public.reference_inscriptions TO service_role;

ALTER TABLE public.reference_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_inscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reference collections are readable by everyone"
  ON public.reference_collections FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Reference inscriptions are readable by everyone"
  ON public.reference_inscriptions FOR SELECT TO anon, authenticated USING (true);

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
SET search_path = public
AS $$
  SELECT r.siglum, r.script, r.language, r.transliteration, r.translation, r.site, r.url, r.source,
         similarity(r.transliteration_plain, _q) AS similarity
  FROM public.reference_inscriptions r
  WHERE coalesce(btrim(_q), '') <> ''
    AND r.transliteration_plain IS NOT NULL
    AND (_script IS NULL OR r.script ILIKE '%' || _script || '%')
    AND r.transliteration_plain % _q
  ORDER BY similarity(r.transliteration_plain, _q) DESC
  LIMIT least(coalesce(_limit, 5), 20)
$$;

GRANT EXECUTE ON FUNCTION public.search_reference_inscriptions(TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;