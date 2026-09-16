-- ============ administrator credential (backend only) ============
CREATE TABLE public.admin_credentials (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  display_name text NOT NULL DEFAULT 'فهد (Fahad)',
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_credentials TO service_role;
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only backend code with the service role may read it.

INSERT INTO public.admin_credentials (id, display_name, password_hash) VALUES
  (true, 'فهد (Fahad)',
   'pbkdf2$120000$d4d535a08f79ee2baf7472f8164647b2$4cba3f27baac01d8964fe82cb11b50aaeed3575cca7a6b9ed1df5c9ad2d5bd7c');

-- ============ user accounts ============
CREATE TYPE public.access_status AS ENUM ('pending', 'approved', 'suspended', 'revoked');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  status public.access_status NOT NULL DEFAULT 'pending',
  invited_email text,
  status_note text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
-- Status is never writable by users: no INSERT/UPDATE/DELETE policies exist,
-- so nobody can approve themselves or grant themselves administrator rights.

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Every new auth user starts as "awaiting administrator approval".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, status)
  VALUES (NEW.id, NEW.email, NULLIF(NEW.raw_user_meta_data->>'display_name', ''), 'pending')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ invitations ============
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  accepted_at timestamptz,
  cancelled_at timestamptz,
  delivery text NOT NULL DEFAULT 'unknown',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
-- Backend only: no policies, so invitation records are not exposed to the app.

CREATE UNIQUE INDEX invitations_open_email
  ON public.invitations (lower(email)) WHERE status = 'pending';

-- ============ audit log ============
CREATE TABLE public.access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'administrator',
  subject_email text,
  subject_user uuid,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.access_audit TO service_role;
ALTER TABLE public.access_audit ENABLE ROW LEVEL SECURITY;
-- Backend only. Never stores passwords or invitation tokens.

-- ============ messages & feedback ============
CREATE TABLE public.feedback_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  category text NOT NULL CHECK (category IN ('contact_admin', 'problem', 'improvement')),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_review', 'planned', 'resolved', 'closed')),
  last_admin_reply_at timestamptz,
  user_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feedback_threads TO authenticated;
GRANT ALL ON public.feedback_threads TO service_role;
ALTER TABLE public.feedback_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own conversations" ON public.feedback_threads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER feedback_threads_touch BEFORE UPDATE ON public.feedback_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.feedback_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.feedback_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user', 'admin')),
  body text NOT NULL,
  screenshot_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feedback_messages TO authenticated;
GRANT ALL ON public.feedback_messages TO service_role;
ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read messages in their own conversations" ON public.feedback_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.feedback_threads t
      WHERE t.id = feedback_messages.thread_id AND t.user_id = auth.uid()
    )
  );

CREATE INDEX feedback_messages_thread ON public.feedback_messages (thread_id, created_at);

CREATE TABLE public.feedback_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.feedback_threads(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feedback_status_history TO authenticated;
GRANT ALL ON public.feedback_status_history TO service_role;
ALTER TABLE public.feedback_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read status history of their own conversations"
  ON public.feedback_status_history
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.feedback_threads t
      WHERE t.id = feedback_status_history.thread_id AND t.user_id = auth.uid()
    )
  );