-- Add DELETE policy for counting_sessions table
CREATE POLICY "Authenticated users can delete sessions"
ON public.counting_sessions
FOR DELETE
USING (auth.uid() IS NOT NULL);