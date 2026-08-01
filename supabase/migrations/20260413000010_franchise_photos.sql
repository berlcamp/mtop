-- Franchise owner / driver portraits and driver details.
-- These live on the franchise (not the application) because they carry across
-- renewals and feed the Franchise Card, which is a franchise-level artifact.
-- Photos are stored in the existing public `mtop-documents` bucket under
-- photos/<franchise_id>/mtop_<slot>_<timestamp>.jpg — the columns hold the
-- resulting public URL.

ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS owner_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS driver_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_number TEXT,
  ADD COLUMN IF NOT EXISTS driver_address TEXT;

COMMENT ON COLUMN mtop.mtop_franchises.owner_photo_url IS
  'Public URL of the franchise owner portrait (3:4, 600x800 JPEG).';
COMMENT ON COLUMN mtop.mtop_franchises.driver_photo_url IS
  'Public URL of the driver portrait (3:4, 600x800 JPEG).';
