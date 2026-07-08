
CREATE TYPE public.finding_decision AS ENUM ('accepted', 'rejected');

CREATE TABLE public.finding_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  critique_id UUID NOT NULL REFERENCES public.critiques(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  decision public.finding_decision NOT NULL,
  owner TEXT,
  due_date DATE,
  decision_note TEXT,
  decided_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (critique_id, finding_id)
);

CREATE INDEX finding_decisions_critique_idx ON public.finding_decisions (critique_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finding_decisions TO authenticated;
GRANT SELECT ON public.finding_decisions TO anon;
GRANT ALL ON public.finding_decisions TO service_role;

ALTER TABLE public.finding_decisions ENABLE ROW LEVEL SECURITY;

-- Owners of the parent critique can do anything with decisions on it.
CREATE POLICY "critique owners manage decisions"
  ON public.finding_decisions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.critiques c
      WHERE c.id = finding_decisions.critique_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.critiques c
      WHERE c.id = finding_decisions.critique_id
        AND c.user_id = auth.uid()
    )
    AND decided_by = auth.uid()
  );

-- Anonymous / public-share viewers can read decisions on a publicly shared critique.
CREATE POLICY "public shared critique decisions"
  ON public.finding_decisions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.critiques c
      WHERE c.id = finding_decisions.critique_id
        AND c.is_public = true
        AND c.share_password_hash IS NULL
        AND (c.share_expires_at IS NULL OR c.share_expires_at > now())
    )
  );

CREATE POLICY "public shared critique decisions auth"
  ON public.finding_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.critiques c
      WHERE c.id = finding_decisions.critique_id
        AND c.is_public = true
        AND c.share_password_hash IS NULL
        AND (c.share_expires_at IS NULL OR c.share_expires_at > now())
    )
  );

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_finding_decisions_updated_at
  BEFORE UPDATE ON public.finding_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
