-- PitStop demo catalog — run AFTER supabase/schema.sql in the Supabase SQL editor.

-- Existing DB with spare_parts? Run supabase/migrate-to-store.sql first.

-- Demo shop owners also need Auth users (Dashboard → Authentication → Users → Add user).

-- Suggested password for all demo owners: demo123



insert into public.areas (id, name, name_ar, city, city_ar) values

  ('maadi', 'Maadi', 'المعادي', 'Cairo', 'القاهرة'),

  ('nasr-city', 'Nasr City', 'مدينة نصر', 'Cairo', 'القاهرة'),

  ('mohandessin', 'Mohandessin', 'المهندسين', 'Giza', 'الجيزة'),

  ('october', '6th October', '6 أكتوبر', 'Giza', 'الجيزة'),

  ('heliopolis', 'Heliopolis', 'مصر الجديدة', 'Cairo', 'القاهرة'),

  ('el-rehab', 'El Rehab', 'الرحاب', 'Cairo', 'القاهرة')

on conflict (id) do update set

  name = excluded.name,

  name_ar = excluded.name_ar,

  city = excluded.city,

  city_ar = excluded.city_ar;



insert into public.shops

  (id, name, name_ar, type, area_id, address, address_ar, phone, latitude, longitude, owner_email, rating)

values

  ('shop-wash-nile', 'Nile Auto Wash', 'مغسلة النيل', 'wash', 'maadi', 'Street 9, Maadi', 'شارع 9، المعادي', '+201022334455', 29.9602, 31.2569, 'wash@demo.com', 4.8),

  ('shop-wash-city', 'City Shine Wash', 'مغسلة سيتي شاين', 'wash', 'nasr-city', 'Abbas El Akkad St.', 'شارع عباس العقاد', '+201055667788', 30.0511, 31.3656, 'wash2@demo.com', 4.6),

  ('shop-wash-mohandessin', 'Premium Wash Mohandessin', 'مغسلة Premium المهندسين', 'wash', 'mohandessin', 'Gameat El Dewal', 'جامعة الدول', '+201066778899', 30.0626, 31.2, 'wash3@demo.com', 4.7),

  ('shop-wash-rehab', 'Rehab City Auto Wash', 'مغسلة الرحاب', 'wash', 'el-rehab', 'El Rehab City, New Cairo', 'مدينة الرحاب، القاهرة الجديدة', '+201088887766', 30.0244, 31.4939, 'rehab.wash@demo.com', 4.8),

  ('shop-maint-autofix', 'AutoFix Service Center', 'مركز AutoFix للصيانة', 'maintenance', 'october', 'Industrial Zone, 6th October', 'المنطقة الصناعية، 6 أكتوبر', '+201011223344', 29.9285, 30.9188, 'maintenance@demo.com', 4.9),

  ('shop-maint-elite', 'Elite Motors Workshop', 'ورشة Elite Motors', 'maintenance', 'heliopolis', 'El Merghany St.', 'شارع الميرغني', '+201077889900', 30.0875, 31.324, 'maintenance2@demo.com', 4.7),

  ('shop-maint-maadi', 'Maadi Motors Care', 'ماادي موتورز للصيانة', 'maintenance', 'maadi', 'Road 232, Maadi', 'الطريق 232، المعادي', '+201088990011', 29.967, 31.249, 'maintenance3@demo.com', 4.5),

  ('shop-winch-maadi', 'Maadi Rescue Winch', 'ونش إنقاذ المعادي', 'winch', 'maadi', 'Road 9, Maadi', 'طريق 9، المعادي', '+201010101010', 29.9612, 31.2575, 'winch@demo.com', 4.8),

  ('shop-winch-nasr', 'Nasr City Tow Service', 'خدمة ونش مدينة نصر', 'winch', 'nasr-city', 'Makram Ebeid, Nasr City', 'مكرم عبيد، مدينة نصر', '+201020202020', 30.0566, 31.3433, 'winch2@demo.com', 4.6),

  ('shop-parts-nasr', 'Nasr Auto Parts', 'قطع غيار مدينة نصر', 'parts', 'nasr-city', 'Suez Road, Nasr City', 'طريق السويس، مدينة نصر', '+201033445566', 30.059, 31.338, 'parts@demo.com', 4.4),

  ('shop-parts-maadi', 'Maadi Spare Parts Hub', 'مركز قطع غيار المعادي', 'parts', 'maadi', 'Degla Square', 'ميدان دجلة', '+201044556677', 29.955, 31.262, 'parts2@demo.com', 4.6),

  ('shop-accessories-maadi', 'Maadi Auto Accessories', 'إكسسوارات سيارات المعادي', 'accessories', 'maadi', 'Road 9, Maadi', 'طريق 9، المعادي', '+201055112233', 29.958, 31.261, 'accessories@demo.com', 4.5),

  ('shop-accessories-nasr', 'Nasr City Car Accessories', 'إكسسوارات مدينة نصر', 'accessories', 'nasr-city', 'Abbas El Akkad St.', 'شارع عباس العقاد', '+201066223344', 30.052, 31.364, 'accessories2@demo.com', 4.6)

on conflict (id) do update set

  name = excluded.name,

  name_ar = excluded.name_ar,

  type = excluded.type,

  area_id = excluded.area_id,

  address = excluded.address,

  address_ar = excluded.address_ar,

  phone = excluded.phone,

  latitude = excluded.latitude,

  longitude = excluded.longitude,

  owner_email = excluded.owner_email,

  rating = excluded.rating;



insert into public.store (shop_id, category, name, image_url, price_egp, stock_qty) values

  ('shop-parts-nasr', 'parts', 'Brake Pads', null, 850, 12),

  ('shop-parts-nasr', 'parts', 'Engine Oil 5W-30', null, 620, 20),

  ('shop-parts-maadi', 'parts', 'Air Filter', null, 280, 15),

  ('shop-parts-maadi', 'parts', 'Battery 70Ah', null, 2600, 6),

  ('shop-accessories-maadi', 'accessories', 'Phone Holder', null, 350, 25),

  ('shop-accessories-maadi', 'accessories', 'Seat Covers Set', null, 1200, 8),

  ('shop-accessories-nasr', 'accessories', 'LED Interior Lights', null, 420, 14),

  ('shop-accessories-nasr', 'accessories', 'Steering Wheel Cover', null, 180, 30);


