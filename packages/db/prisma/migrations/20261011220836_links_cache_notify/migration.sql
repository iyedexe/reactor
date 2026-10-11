-- The links service (/r/{code}) caches stands and location branding in memory.
-- Any change to the data it serves notifies it to reload (LISTEN avis_links).
CREATE OR REPLACE FUNCTION avis_links_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('avis_links', TG_TABLE_NAME);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stand_links_notify AFTER INSERT OR UPDATE OR DELETE ON "stand"
  FOR EACH STATEMENT EXECUTE FUNCTION avis_links_notify();

CREATE TRIGGER location_links_notify AFTER UPDATE OR DELETE ON "location"
  FOR EACH STATEMENT EXECUTE FUNCTION avis_links_notify();

CREATE TRIGGER organization_links_notify AFTER UPDATE OF "serviceState", "name" ON "organization"
  FOR EACH STATEMENT EXECUTE FUNCTION avis_links_notify();
