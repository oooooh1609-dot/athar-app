CREATE TABLE public.extensions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL,
  purpose text NOT NULL,
  runtime text NOT NULL,
  license text NOT NULL,
  source_url text,
  requirements text,
  endpoint text,
  needs_paid_service boolean NOT NULL DEFAULT false,
  manifest jsonb NOT NULL,
  module_source text,
  status text NOT NULL DEFAULT 'imported',
  status_note text,
  builtin boolean NOT NULL DEFAULT false,
  secret_name text,
  last_test_at timestamp with time zone,
  last_test_note text,
  previous_version jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.extensions TO service_role;
ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER extensions_touch BEFORE UPDATE ON public.extensions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.extension_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extension_id uuid NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  extension_version text NOT NULL,
  actor text NOT NULL DEFAULT 'administrator',
  surface text,
  event text NOT NULL,
  detail text,
  duration_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.extension_runs TO service_role;
ALTER TABLE public.extension_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX extension_runs_recent ON public.extension_runs (created_at DESC);