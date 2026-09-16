CREATE TABLE public.research_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT,
  year INTEGER,
  publisher TEXT,
  source_url TEXT,
  license TEXT NOT NULL,
  permission_note TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.research_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.research_documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
  UNIQUE (document_id, page)
);
CREATE INDEX research_pages_tsv_idx ON public.research_pages USING GIN (tsv);

CREATE TABLE public.ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL,
  model TEXT NOT NULL,
  had_image BOOLEAN NOT NULL DEFAULT false,
  input_tokens INTEGER,
  output_tokens INTEGER,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_created_idx ON public.ai_usage (created_at DESC);

CREATE TABLE public.ai_settings (
  id BOOLEAN NOT NULL DEFAULT true PRIMARY KEY,
  quick_model TEXT NOT NULL DEFAULT 'openai/gpt-5.6-luna',
  detailed_model TEXT NOT NULL DEFAULT 'openai/gpt-6-astra',
  monthly_call_limit INTEGER NOT NULL DEFAULT 500,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_settings_singleton CHECK (id)
);
INSERT INTO public.ai_settings (id) VALUES (true);

GRANT ALL ON public.research_documents TO service_role;
GRANT ALL ON public.research_pages TO service_role;
GRANT ALL ON public.ai_usage TO service_role;
GRANT ALL ON public.ai_settings TO service_role;

ALTER TABLE public.research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.search_research_pages(_q TEXT, _limit INTEGER DEFAULT 6)
RETURNS TABLE (
  document_id UUID,
  title TEXT,
  authors TEXT,
  year INTEGER,
  source_url TEXT,
  license TEXT,
  page INTEGER,
  snippet TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id,
         d.title,
         d.authors,
         d.year,
         d.source_url,
         d.license,
         p.page,
         ts_headline('simple', p.text, websearch_to_tsquery('simple', _q),
                     'MaxWords=45, MinWords=20, ShortWord=2, MaxFragments=2, FragmentDelimiter= … ') AS snippet,
         ts_rank(p.tsv, websearch_to_tsquery('simple', _q)) AS rank
  FROM public.research_pages p
  JOIN public.research_documents d ON d.id = p.document_id
  WHERE p.tsv @@ websearch_to_tsquery('simple', _q)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 6), 1), 20);
$$;