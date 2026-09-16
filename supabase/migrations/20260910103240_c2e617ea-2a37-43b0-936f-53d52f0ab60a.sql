CREATE TABLE public.glyph_exemplars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script text NOT NULL,
  letter text NOT NULL,
  transliteration text,
  feature_version integer NOT NULL DEFAULT 1,
  features real[] NOT NULL,
  source text NOT NULL DEFAULT 'user_label',
  provenance text,
  notes text,
  app_version text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX glyph_exemplars_lookup ON public.glyph_exemplars (script, review_status, feature_version);

GRANT SELECT ON public.glyph_exemplars TO anon, authenticated;
GRANT ALL ON public.glyph_exemplars TO service_role;
ALTER TABLE public.glyph_exemplars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved glyph exemplars are readable by everyone"
  ON public.glyph_exemplars FOR SELECT
  TO anon, authenticated
  USING (review_status = 'approved');

CREATE TABLE public.glyph_eval_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script text,
  feature_version integer NOT NULL DEFAULT 1,
  exemplars integer NOT NULL DEFAULT 0,
  letters integer NOT NULL DEFAULT 0,
  accuracy real,
  per_letter jsonb,
  method text NOT NULL DEFAULT 'leave-one-out 1-nn cosine',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.glyph_eval_runs TO anon, authenticated;
GRANT ALL ON public.glyph_eval_runs TO service_role;
ALTER TABLE public.glyph_eval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Evaluation runs are readable by everyone"
  ON public.glyph_eval_runs FOR SELECT
  TO anon, authenticated
  USING (true);