CREATE TABLE public.recon_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_key text NOT NULL,
  owner_label text,
  project_name text,
  scale_reference text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','canceled')),
  stage text,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  photo_paths text[] NOT NULL DEFAULT '{}',
  photo_count integer NOT NULL DEFAULT 0,
  model_path text,
  formats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  log text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_by uuid,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  canceled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recon_jobs_owner_idx ON public.recon_jobs (owner_key, created_at DESC);
CREATE INDEX recon_jobs_status_idx ON public.recon_jobs (status, created_at);
GRANT ALL ON public.recon_jobs TO service_role;
ALTER TABLE public.recon_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.worker_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  token_hash text NOT NULL,
  token_prefix text NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  host text,
  meshroom_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.worker_credentials TO service_role;
ALTER TABLE public.worker_credentials ENABLE ROW LEVEL SECURITY;