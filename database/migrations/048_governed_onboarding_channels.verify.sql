DO $$
DECLARE
  v_unmapped_scopes integer;
  v_unmapped_instances integer;
BEGIN
  SELECT count(*) INTO v_unmapped_scopes
  FROM onboarding.journey_scopes WHERE channel_definition_id IS NULL OR channel_version_id IS NULL;
  IF v_unmapped_scopes<>0 THEN
    RAISE EXCEPTION 'Governed channel migration left % journey scopes unmapped',v_unmapped_scopes;
  END IF;

  SELECT count(*) INTO v_unmapped_instances
  FROM onboarding.journey_instances
  WHERE source_channel_definition_id IS NULL OR source_channel_version_id IS NULL
     OR current_channel_definition_id IS NULL OR current_channel_version_id IS NULL;
  IF v_unmapped_instances<>0 THEN
    RAISE EXCEPTION 'Governed channel migration left % journey instances unmapped',v_unmapped_instances;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_permissions WHERE code='onboarding_channels.check'
  ) THEN
    RAISE EXCEPTION 'Onboarding channel governance permissions are missing';
  END IF;
END $$;
