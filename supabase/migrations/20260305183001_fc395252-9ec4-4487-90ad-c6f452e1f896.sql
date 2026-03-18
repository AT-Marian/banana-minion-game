CREATE TABLE public.question_solutions (
  id TEXT PRIMARY KEY,
  solution INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow edge function (service role) to manage this table, no RLS needed
ALTER TABLE public.question_solutions ENABLE ROW LEVEL SECURITY;

-- Clean up old entries automatically (older than 10 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_old_questions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.question_solutions WHERE created_at < now() - interval '10 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_questions_trigger
AFTER INSERT ON public.question_solutions
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_questions();