
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- critiques
CREATE TABLE public.critiques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  image_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'analyzing',
  overall_score NUMERIC,
  rubric JSONB,
  issues JSONB,
  summary TEXT,
  share_slug TEXT UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critiques TO authenticated;
GRANT SELECT ON public.critiques TO anon;
GRANT ALL ON public.critiques TO service_role;
ALTER TABLE public.critiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own critiques" ON public.critiques FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public shared critiques" ON public.critiques FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "public shared critiques auth" ON public.critiques FOR SELECT TO authenticated USING (is_public = true);

CREATE INDEX critiques_user_id_idx ON public.critiques(user_id);
CREATE INDEX critiques_project_id_idx ON public.critiques(project_id);
CREATE INDEX critiques_share_slug_idx ON public.critiques(share_slug) WHERE share_slug IS NOT NULL;

-- storage policies for private designs bucket
CREATE POLICY "own design uploads" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'designs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own design reads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'designs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own design deletes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'designs' AND (storage.foldername(name))[1] = auth.uid()::text);
