-- Migration to activate all existing vehicles
UPDATE vehicles SET is_active = true WHERE is_active = false;
