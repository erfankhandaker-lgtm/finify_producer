DO $$
DECLARE
  v_nodes integer;
  v_transitions integer;
BEGIN
  SELECT count(*) INTO v_nodes FROM onboarding.journey_nodes
  WHERE journey_version_id='00000000-0000-4000-8004-000000000001';
  SELECT count(*) INTO v_transitions FROM onboarding.journey_transitions
  WHERE journey_version_id='00000000-0000-4000-8004-000000000001';
  IF v_nodes<>15 OR v_transitions<>16 THEN
    RAISE EXCEPTION 'Default onboarding graph is incomplete: % nodes, % transitions',v_nodes,v_transitions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM onboarding.journey_versions
    WHERE id='00000000-0000-4000-8004-000000000001' AND status='DRAFT'
  ) THEN RAISE EXCEPTION 'Default onboarding journey must remain a draft until dependencies are bound'; END IF;
END $$;
