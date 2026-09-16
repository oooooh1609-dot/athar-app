CREATE TABLE public.reading_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script text NOT NULL,
  machine_reading text,
  corrected_reading text NOT NULL,
  word text,
  meaning_ar text,
  reason text,
  siglum text,
  source_note text,
  permission_note text,
  review_status text NOT NULL DEFAULT 'pending',
  reviewer_note text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX reading_corrections_status_idx ON public.reading_corrections (review_status, script);
CREATE INDEX reading_corrections_word_idx ON public.reading_corrections (lower(word));

GRANT SELECT ON public.reading_corrections TO anon, authenticated;
GRANT ALL ON public.reading_corrections TO service_role;

ALTER TABLE public.reading_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved corrections are readable by everyone"
  ON public.reading_corrections FOR SELECT
  TO anon, authenticated
  USING (review_status = 'approved');