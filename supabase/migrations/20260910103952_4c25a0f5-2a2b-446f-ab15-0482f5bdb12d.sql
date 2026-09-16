CREATE OR REPLACE FUNCTION public.glyph_dataset_counts(_script text)
RETURNS TABLE(letter text, approved integer, pending integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.letter,
         count(*) FILTER (WHERE g.review_status = 'approved')::int AS approved,
         count(*) FILTER (WHERE g.review_status = 'pending')::int AS pending
  FROM public.glyph_exemplars g
  WHERE g.script = _script
  GROUP BY g.letter
  ORDER BY 2 DESC, 1
$$;

GRANT EXECUTE ON FUNCTION public.glyph_dataset_counts(text) TO anon, authenticated, service_role;