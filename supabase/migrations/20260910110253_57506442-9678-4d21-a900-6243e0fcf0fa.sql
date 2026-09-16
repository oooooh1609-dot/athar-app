CREATE TABLE public.glyph_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script TEXT NOT NULL,
  version INTEGER NOT NULL,
  feature_version INTEGER NOT NULL DEFAULT 1,
  classes JSONB NOT NULL,
  metrics JSONB NOT NULL,
  accuracy DOUBLE PRECISION,
  macro_f1 DOUBLE PRECISION,
  trained_on INTEGER NOT NULL DEFAULT 0,
  letters INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','active','retired')),
  provenance TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  activated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (script, version)
);

CREATE INDEX glyph_models_active_idx ON public.glyph_models (script, status);

GRANT SELECT ON public.glyph_models TO anon;
GRANT SELECT ON public.glyph_models TO authenticated;
GRANT ALL ON public.glyph_models TO service_role;

ALTER TABLE public.glyph_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active models are readable" ON public.glyph_models
  FOR SELECT TO anon, authenticated USING (status = 'active');