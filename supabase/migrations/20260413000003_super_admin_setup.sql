-- Super Admin Setup
--
-- IMPORTANT: The user_profiles.id column references auth.users(id).
-- For the very first super admin, you have TWO options:
--
-- OPTION A: The super admin logs in FIRST via Google OAuth, which creates
-- their auth.users record. Then run this SQL with their actual auth user ID.
-- You can find the ID in Supabase Dashboard > Authentication > Users.
--
-- OPTION B: Use the placeholder approach (same as the admin "Add User" feature).
-- Insert with a random UUID and the admin's email. When they log in for the
-- first time, the auth callback will detect the email match and swap the
-- placeholder ID with their real auth.users ID.
--
-- Below uses OPTION B (placeholder approach):

-- Step 1: Temporarily disable the FK constraint to allow placeholder IDs
ALTER TABLE mtop.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;

-- Step 2: Insert the super admin profile (replace email and name with yours)
INSERT INTO mtop.user_profiles (id, email, full_name)
VALUES (
  gen_random_uuid(),
  'YOUR_GOOGLE_EMAIL@gmail.com',  -- << CHANGE THIS to your Google email
  'Super Admin'                    -- << CHANGE THIS to your name
);

-- Step 3: Assign the admin role
INSERT INTO mtop.user_roles (user_id, role_id)
SELECT up.id, r.id
FROM mtop.user_profiles up, mtop.roles r
WHERE up.email = 'YOUR_GOOGLE_EMAIL@gmail.com'  -- << SAME email as above
  AND r.code = 'admin';

-- Step 4: Re-enable the FK constraint
-- NOTE: Only re-enable this AFTER the super admin has logged in once
-- (which replaces the placeholder UUID with their real auth.users ID).
-- Until then, keep the constraint disabled.
--
-- To re-enable later, run:
-- ALTER TABLE mtop.user_profiles
--   ADD CONSTRAINT user_profiles_id_fkey
--   FOREIGN KEY (id) REFERENCES auth.users(id);
