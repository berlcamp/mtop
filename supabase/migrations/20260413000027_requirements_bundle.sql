-- One scanned PDF of the whole requirements folder.
--
-- The checklist has up to ~37 rows, and the office does not receive them as 37
-- separate files: the operator hands over a folder, the counter scans it once,
-- and that single PDF is the evidence for everything in it. Attaching a file
-- per row was never how the paper works, and doing it 15 times is the slowest
-- part of verification.
--
-- The bundle lives on the application rather than on the franchise because it
-- is what was produced for this transaction — a renewal's folder is not the
-- folder filed for the change of unit two years later. It sits in the existing
-- public `mtop-documents` bucket under <application_id>/requirements-<ts>.pdf,
-- alongside the per-row attachments.
--
-- mtop_application_requirements.file_url is deliberately left in place. A
-- deficiency is often raised after verification — an inspector or assessor
-- returns the application over a missing document — and the counter has to be
-- able to attach that one document on its own row when the operator brings it
-- in, without rescanning the whole folder. The bundle is the normal path; the
-- per-row attachment is the exception it does not cover.
--
-- The name and size are stored because a URL alone cannot tell a clerk whether
-- the thing on file is the folder they scanned; uploaded_at/by is the same
-- provenance the requirement rows already keep in verified_at/verified_by.
-- mtop_applications is not covered by the audit trigger (that watches
-- mtop_franchises), so this is the only record of who put the file there.

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS requirements_file_url    TEXT,
  ADD COLUMN IF NOT EXISTS requirements_file_name   TEXT,
  ADD COLUMN IF NOT EXISTS requirements_file_size   BIGINT,
  ADD COLUMN IF NOT EXISTS requirements_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requirements_uploaded_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN mtop.mtop_applications.requirements_file_url IS
  'Public URL of the single scanned PDF covering this application''s requirements folder.';
COMMENT ON COLUMN mtop.mtop_applications.requirements_file_name IS
  'Original filename as uploaded, shown to the clerk so the file on record is identifiable.';
COMMENT ON COLUMN mtop.mtop_applications.requirements_file_size IS
  'Size in bytes of the bundled PDF.';
COMMENT ON COLUMN mtop.mtop_applications.requirements_uploaded_at IS
  'When the bundled PDF was last replaced.';
COMMENT ON COLUMN mtop.mtop_applications.requirements_uploaded_by IS
  'Who last uploaded the bundled PDF. mtop_applications has no audit trigger, so this is the only provenance for it.';
