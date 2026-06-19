INSERT INTO categories (slug, name_en, name_ar, sort_order) VALUES
  ('electronics', 'Electronics', 'إلكترونيات', 10),
  ('phones-tablets', 'Phones and tablets', 'هواتف وأجهزة لوحية', 20),
  ('fashion', 'Fashion', 'أزياء', 30),
  ('home', 'Home', 'منزل', 40),
  ('beauty', 'Beauty', 'جمال', 50),
  ('vehicles', 'Vehicles', 'مركبات', 60),
  ('vehicle-parts', 'Vehicle parts', 'قطع مركبات', 70),
  ('tools-equipment', 'Tools and equipment', 'أدوات ومعدات', 80),
  ('services', 'Services', 'خدمات', 90),
  ('jobs', 'Jobs', 'وظائف', 100)
ON CONFLICT (slug) DO NOTHING;
