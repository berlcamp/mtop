-- Final manual-grant contract after migrations 20261027000034 and 20261028000035.
-- Run on the positively identified local MTOP database only.
-- Every synthetic record and audit row is rolled back.
BEGIN;
DO $$
DECLARE
  v_actor uuid;
  v_type record;
  v_franchise uuid;
  v_app uuid;
  v_issued date := '2026-06-01';
  v_prior date := '2028-07-15';
  v_selected date := '2030-12-31';
  v_expected date;
  v_actual date;
  v_status text;
  v_log_count integer;
  v_counter integer := 0;
BEGIN
  SELECT ur.user_id INTO v_actor
  FROM mtop.user_roles ur
  JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
  JOIN mtop.permissions p ON p.id = rp.permission_id
  WHERE p.code = 'application.grant' LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'No local grant officer for test'; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  FOR v_type IN SELECT id, code, grant_effect::text AS grant_effect FROM mtop.transaction_types ORDER BY code LOOP
    v_counter := v_counter + 1;
    INSERT INTO mtop.mtop_franchises
      (applicant_name, motor_number, chassis_number, plate_number, mtop_number, granted_until)
    VALUES
      ('ZZTEST Plate Grant Owner ' || v_counter,
       'ZZTEST-MOTOR-' || v_counter, 'ZZTEST-CHASSIS-' || v_counter,
       'ZZTEST-PLATE-' || v_counter || '2',
       'ZZTEST-MTOP-' || v_counter,
       CASE WHEN v_type.grant_effect = 'issue_number' THEN NULL ELSE v_prior END)
    RETURNING id INTO v_franchise;
    IF v_type.grant_effect = 'issue_number' THEN
      BEGIN
        INSERT INTO mtop.mtop_applications
          (franchise_id, transaction_type_id, status, date_issued)
        VALUES (v_franchise, v_type.id, 'granted', v_issued);
        RAISE EXCEPTION 'Direct granted insert was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Direct granted insert was accepted' THEN RAISE; END IF;
      END;
    END IF;
    INSERT INTO mtop.mtop_applications
      (franchise_id, transaction_type_id, status,
       new_motor_number, new_chassis_number, new_plate_number,
       new_applicant_name)
    VALUES
      (v_franchise, v_type.id, 'for_approval',
       CASE WHEN v_type.grant_effect = 'replace_unit' THEN 'ZZTEST-NEW-MOTOR-' || v_counter END,
       CASE WHEN v_type.grant_effect = 'replace_unit' THEN 'ZZTEST-NEW-CHASSIS-' || v_counter END,
       CASE WHEN v_type.grant_effect = 'replace_unit' THEN 'ZZTEST-NEW-PLATE-' || v_counter || '8' END,
       CASE WHEN v_type.grant_effect = 'transfer_owner' THEN 'ZZTEST Successor ' || v_counter END)
    RETURNING id INTO v_app;

    IF v_type.grant_effect = 'issue_number' THEN
      BEGIN
        PERFORM mtop.approve_and_grant(v_app, NULL, v_selected, NULL);
        RAISE EXCEPTION 'Missing issuance date was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Missing issuance date was accepted' THEN RAISE; END IF;
      END;
      BEGIN
        PERFORM mtop.approve_and_grant(v_app, v_issued, NULL, NULL);
        RAISE EXCEPTION 'Missing expiration was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Missing expiration was accepted' THEN RAISE; END IF;
      END;
      BEGIN
        PERFORM mtop.approve_and_grant(v_app, v_issued, v_issued, NULL);
        RAISE EXCEPTION 'Non-later expiration was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Non-later expiration was accepted' THEN RAISE; END IF;
      END;
      SELECT status::text INTO v_status FROM mtop.mtop_applications WHERE id = v_app;
      IF v_status <> 'for_approval' THEN RAISE EXCEPTION 'Failed grant changed status'; END IF;
      PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
      BEGIN
        PERFORM mtop.approve_and_grant(v_app, v_issued, v_selected, NULL);
        RAISE EXCEPTION 'Unauthorized grant was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Unauthorized grant was accepted' THEN RAISE; END IF;
      END;
      PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    ELSIF v_type.grant_effect = 'extend_validity' THEN
      BEGIN
        PERFORM mtop.approve_and_grant(v_app, v_issued, NULL, NULL);
        RAISE EXCEPTION 'Missing renewal expiration was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Missing renewal expiration was accepted' THEN RAISE; END IF;
      END;
    ELSE
      BEGIN
        PERFORM mtop.approve_and_grant(v_app, v_issued, v_selected, NULL);
        RAISE EXCEPTION 'Administrative expiration was accepted';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Administrative expiration was accepted' THEN RAISE; END IF;
      END;
    END IF;

    PERFORM mtop.approve_and_grant(v_app, v_issued,
      CASE WHEN v_type.grant_effect IN ('issue_number','extend_validity') THEN v_selected ELSE NULL END,
      'ZZTEST transaction');
    SELECT f.granted_until INTO v_actual FROM mtop.mtop_franchises f WHERE f.id = v_franchise;
    v_expected := CASE WHEN v_type.grant_effect IN ('issue_number','extend_validity')
      THEN v_selected ELSE v_prior END;
    IF v_actual IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION '% expiration: got %, expected %', v_type.code, v_actual, v_expected;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mtop.mtop_applications WHERE id = v_app
      AND status = 'granted' AND date_issued = v_issued AND granted_at IS NOT NULL
      AND expiration_date IS NOT DISTINCT FROM
        CASE WHEN v_type.grant_effect IN ('issue_number','extend_validity') THEN v_selected ELSE NULL END) THEN
      RAISE EXCEPTION '% date/status did not persist', v_type.code;
    END IF;
    SELECT count(*) INTO v_log_count FROM mtop.approval_logs WHERE application_id = v_app AND action = 'approved';
    IF v_log_count <> 1 THEN RAISE EXCEPTION '% logged % approvals', v_type.code, v_log_count; END IF;
    BEGIN
      PERFORM mtop.approve_and_grant(v_app, v_issued,
        CASE WHEN v_type.grant_effect IN ('issue_number','extend_validity') THEN v_selected ELSE NULL END, NULL);
      RAISE EXCEPTION 'Duplicate grant was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'Duplicate grant was accepted' THEN RAISE; END IF;
    END;
    SELECT count(*) INTO v_log_count FROM mtop.approval_logs WHERE application_id = v_app AND action = 'approved';
    IF v_log_count <> 1 THEN RAISE EXCEPTION 'Duplicate approval log'; END IF;
    BEGIN
      UPDATE mtop.mtop_applications SET expiration_date = DATE '2099-12-31' WHERE id = v_app;
      RAISE EXCEPTION 'Granted expiration was editable';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'Granted expiration was editable' THEN RAISE; END IF;
    END;
    BEGIN
      UPDATE mtop.mtop_applications SET date_issued = DATE '2000-01-01' WHERE id = v_app;
      RAISE EXCEPTION 'Granted issuance was editable';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'Granted issuance was editable' THEN RAISE; END IF;
    END;
  END LOOP;
  RAISE NOTICE 'PASS: seven synthetic effects, persisted dates, rollback, immutable dates, duplicate rejection, and atomic audit';
END;
$$;
ROLLBACK;
