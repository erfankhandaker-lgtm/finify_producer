BEGIN;

DELETE FROM public.admin_role_permissions role_permission
USING public.admin_permissions permission
WHERE role_permission.permission_id=permission.id AND permission.code LIKE 'onboarding_channels.%';
DELETE FROM public.admin_permissions WHERE code LIKE 'onboarding_channels.%';

ALTER TABLE onboarding.journey_instances
  DROP COLUMN IF EXISTS current_channel_version_id,
  DROP COLUMN IF EXISTS current_channel_definition_id,
  DROP COLUMN IF EXISTS source_channel_version_id,
  DROP COLUMN IF EXISTS source_channel_definition_id;
ALTER TABLE onboarding.journey_scopes
  DROP COLUMN IF EXISTS channel_version_id,
  DROP COLUMN IF EXISTS channel_definition_id;

DROP TABLE IF EXISTS onboarding.channel_audit_events;
DROP TABLE IF EXISTS onboarding.channel_handoffs;
DROP TABLE IF EXISTS onboarding.channel_sessions;
DROP TABLE IF EXISTS onboarding.channel_clients;
DROP TABLE IF EXISTS onboarding.channel_node_capabilities;
DROP TABLE IF EXISTS onboarding.channel_country_scopes;
DROP TABLE IF EXISTS onboarding.channel_versions;
DROP TABLE IF EXISTS onboarding.channel_definitions;

COMMIT;
