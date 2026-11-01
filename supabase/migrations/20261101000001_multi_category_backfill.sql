-- Multi-category: safe to run multiple times.
-- 1) Column (agar pehle nahi bana)
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_names text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_products_category_names ON products USING gin (category_names);

-- 2) Summer Sarees category (agar nahi hai to ban jayegi)
INSERT INTO categories (name, slug)
SELECT 'Summer Sarees', 'summer-sarees'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'summer-sarees' OR name = 'Summer Sarees');

-- 3) Har product ki primary category category_names me bhi ho
UPDATE products
SET category_names = ARRAY(SELECT DISTINCT unnest(category_names || ARRAY[category_name]))
WHERE category_name IS NOT NULL
  AND NOT (category_names @> ARRAY[category_name]);
