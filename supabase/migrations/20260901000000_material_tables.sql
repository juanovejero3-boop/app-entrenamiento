-- ============================================================
-- Material: secciones y items de la biblioteca
-- ============================================================

CREATE TABLE IF NOT EXISTS public.material_sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT 'Nueva sección',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES public.material_sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  link text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Índices para ordenar rápido
CREATE INDEX IF NOT EXISTS idx_material_sections_sort ON public.material_sections(sort_order);
CREATE INDEX IF NOT EXISTS idx_material_items_section_sort ON public.material_items(section_id, sort_order);

-- RLS
ALTER TABLE public.material_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_items ENABLE ROW LEVEL SECURITY;

-- Políticas: todos pueden leer
DROP POLICY IF EXISTS "material_sections_leer" ON public.material_sections;
CREATE POLICY "material_sections_leer" ON public.material_sections FOR SELECT USING (true);

DROP POLICY IF EXISTS "material_items_leer" ON public.material_items;
CREATE POLICY "material_items_leer" ON public.material_items FOR SELECT USING (true);

-- Políticas: solo admin gestiona
DROP POLICY IF EXISTS "material_sections_admin" ON public.material_sections;
CREATE POLICY "material_sections_admin" ON public.material_sections
  FOR ALL USING (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

DROP POLICY IF EXISTS "material_items_admin" ON public.material_items;
CREATE POLICY "material_items_admin" ON public.material_items
  FOR ALL USING (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
