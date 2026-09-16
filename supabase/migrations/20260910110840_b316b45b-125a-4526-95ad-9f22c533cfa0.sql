CREATE TABLE public.corpus_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  siglum text,
  script text NOT NULL,
  image_url text NOT NULL,
  source_url text,
  license text NOT NULL,
  credit text,
  notes text,
  labelled_signs integer NOT NULL DEFAULT 0,
  unknown_signs integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX corpus_images_script ON public.corpus_images (script, created_at DESC);
CREATE UNIQUE INDEX corpus_images_image_url ON public.corpus_images (image_url);

GRANT SELECT ON public.corpus_images TO anon, authenticated;
GRANT ALL ON public.corpus_images TO service_role;
ALTER TABLE public.corpus_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Corpus images are readable by everyone"
  ON public.corpus_images FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_corpus_images_updated_at
  BEFORE UPDATE ON public.corpus_images
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.glyph_exemplars
  ADD COLUMN corpus_image_id uuid REFERENCES public.corpus_images(id) ON DELETE SET NULL,
  ADD COLUMN bbox jsonb,
  ADD COLUMN unknown_sign boolean NOT NULL DEFAULT false;

CREATE INDEX glyph_exemplars_corpus_image ON public.glyph_exemplars (corpus_image_id);