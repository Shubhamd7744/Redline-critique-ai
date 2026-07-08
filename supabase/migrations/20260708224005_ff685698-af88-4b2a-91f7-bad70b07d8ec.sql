ALTER TABLE public.critiques
  ADD COLUMN share_password_hash text,
  ADD COLUMN share_expires_at timestamptz;

DROP POLICY IF EXISTS "public shared critiques" ON public.critiques;
DROP POLICY IF EXISTS "public shared critiques auth" ON public.critiques;

CREATE POLICY "public shared critiques"
  ON public.critiques FOR SELECT TO anon
  USING (
    is_public = true
    AND share_password_hash IS NULL
    AND (share_expires_at IS NULL OR share_expires_at > now())
  );

CREATE POLICY "public shared critiques auth"
  ON public.critiques FOR SELECT TO authenticated
  USING (
    is_public = true
    AND share_password_hash IS NULL
    AND (share_expires_at IS NULL OR share_expires_at > now())
  );