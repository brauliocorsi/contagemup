-- Allow session_id to be NULL for administrative stock movements
ALTER TABLE counts ALTER COLUMN session_id DROP NOT NULL;