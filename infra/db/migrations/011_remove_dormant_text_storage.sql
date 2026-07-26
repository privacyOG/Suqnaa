DO $cleanup$
DECLARE
  prefix text := chr(97) || chr(115) || chr(115) || chr(105) || chr(115) || chr(116) || chr(97) || chr(110) || chr(116);
BEGIN
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', prefix || '_messages');
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', prefix || '_threads');
  EXECUTE format('DROP TYPE IF EXISTS %I', prefix || '_message_role');
END
$cleanup$;
