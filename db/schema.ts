import { integer, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
export const topics = sqliteTable("topics", {
  owner: text("owner").notNull(), id: text("id").notNull(), parentId:text("parent_id"),
  title: text("title").notNull(), summary: text("summary").notNull().default(""),
  decisions: text("decisions").notNull().default(""), nextStep: text("next_step").notNull().default(""),
  status: text("status").notNull().default("active"), updatedAt: text("updated_at").notNull(),
  revision: integer("revision").notNull().default(1),
  tags:text("tags").notNull().default("[]"), groupName:text("group_name").notNull().default(""),
  sources:text("sources").notNull().default("[]"), bindings:text("bindings").notNull().default("[]"), pinned:integer("pinned").notNull().default(0)
}, t => [primaryKey({columns:[t.owner,t.id]}),index("topics_owner_parent_idx").on(t.owner,t.parentId)]);
export const topicSelection = sqliteTable("topic_selection", {
 owner:text("owner").primaryKey(), topicId:text("topic_id").notNull(),
 updatedAt:text("updated_at").notNull()
});
export const topicHistory = sqliteTable("topic_history", {
 owner:text("owner").notNull(), topicId:text("topic_id").notNull(), revision:integer("revision").notNull(),
 snapshot:text("snapshot").notNull(), recordedAt:text("recorded_at").notNull()
},t=>[primaryKey({columns:[t.owner,t.topicId,t.revision]})]);

export const topicActivity=sqliteTable("topic_activity",{owner:text("owner").notNull(),topicId:text("topic_id").notNull(),selectedAt:text("selected_at").notNull()},t=>[primaryKey({columns:[t.owner,t.topicId]})]);

export const topicMerges=sqliteTable("topic_merges",{owner:text("owner").notNull(),id:text("id").notNull(),digest:text("digest").notNull(),payload:text("payload").notNull(),state:text("state").notNull(),createdAt:text("created_at").notNull(),undoneAt:text("undone_at")},t=>[primaryKey({columns:[t.owner,t.id]})]);

export const topicEnrichments=sqliteTable("topic_enrichments",{owner:text("owner").notNull(),id:text("id").notNull(),topicId:text("topic_id").notNull(),requestDigest:text("request_digest").notNull(),previewDigest:text("preview_digest").notNull(),payload:text("payload").notNull(),state:text("state").notNull(),createdAt:text("created_at").notNull()},t=>[primaryKey({columns:[t.owner,t.id]})]);
