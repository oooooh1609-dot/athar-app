REVOKE ALL ON FUNCTION public.search_research_pages(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_research_pages(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.search_research_pages(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_research_pages(TEXT, INTEGER) TO service_role;