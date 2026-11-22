ALTER TABLE `topics` ADD `parent_id` text;--> statement-breakpoint
CREATE TRIGGER topics_parent_insert BEFORE INSERT ON topics WHEN NEW.parent_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT, 'Unknown parent topic') WHERE NOT EXISTS (SELECT 1 FROM topics WHERE owner=NEW.owner AND id=NEW.parent_id);
 SELECT RAISE(ABORT, 'Topic hierarchy cycle') WHERE NEW.parent_id=NEW.id OR EXISTS (WITH RECURSIVE ancestors(id) AS (SELECT NEW.parent_id UNION SELECT t.parent_id FROM topics t JOIN ancestors a ON t.id=a.id WHERE t.owner=NEW.owner AND t.parent_id IS NOT NULL) SELECT 1 FROM ancestors WHERE id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER topics_parent_update BEFORE UPDATE OF parent_id ON topics WHEN NEW.parent_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT, 'Unknown parent topic') WHERE NOT EXISTS (SELECT 1 FROM topics WHERE owner=NEW.owner AND id=NEW.parent_id);
 SELECT RAISE(ABORT, 'Topic hierarchy cycle') WHERE NEW.parent_id=NEW.id OR EXISTS (WITH RECURSIVE ancestors(id) AS (SELECT NEW.parent_id UNION SELECT t.parent_id FROM topics t JOIN ancestors a ON t.id=a.id WHERE t.owner=NEW.owner AND t.parent_id IS NOT NULL) SELECT 1 FROM ancestors WHERE id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER topics_children_delete BEFORE DELETE ON topics
BEGIN
 SELECT RAISE(ABORT, 'Topic still has children') WHERE EXISTS (SELECT 1 FROM topics WHERE owner=OLD.owner AND parent_id=OLD.id);
END;
