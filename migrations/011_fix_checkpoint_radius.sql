-- Fix all checkpoint radii to 10 meters
UPDATE route_checkpoints SET radius_meters = 10.0 WHERE radius_meters != 10.0;
