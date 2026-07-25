DO $verify$
BEGIN
  IF to_regclass('public.reference_data_change_requests') IS NULL THEN
    RAISE EXCEPTION 'reference_data_change_requests is missing';
  END IF;
  IF (
    SELECT count(*) FROM public.admin_permissions
    WHERE code IN ('reference_data.read', 'reference_data.make', 'reference_data.check')
  ) <> 3 THEN
    RAISE EXCEPTION 'reference-data permissions are incomplete';
  END IF;
END
$verify$;

SELECT 'reference data maker-checker migration verified' AS result;
