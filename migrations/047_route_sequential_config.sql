-- 047: Add sequential route configuration columns
ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_sequential BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS corridor_meters FLOAT DEFAULT 50.0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_direction TEXT DEFAULT 'both'; -- 'outbound', 'return', 'both'
ALTER TABLE routes ADD COLUMN IF NOT EXISTS seq_lookahead INT DEFAULT 5;
