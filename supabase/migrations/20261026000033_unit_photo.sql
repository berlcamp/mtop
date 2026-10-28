-- A tricycle image belongs to the franchise record and remains independent
-- from application grant effects and the fixed printable Franchise Card.
ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS unit_photo_url TEXT;

COMMENT ON COLUMN mtop.mtop_franchises.unit_photo_url IS
  'Public URL of the registered unit photo (landscape, 1200x900 JPEG).';
