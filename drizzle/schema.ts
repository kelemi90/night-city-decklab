import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const cards = mysqlTable("cards", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  subtitle: varchar("subtitle", { length: 160 }),
  kind: mysqlEnum("kind", ["legend", "unit", "gear", "program"]).notNull(),
  color: varchar("color", { length: 32 }).notNull(),
  cost: int("cost"),
  power: int("power"),
  ram: int("ram").notNull().default(0),
  rarity: varchar("rarity", { length: 64 }).notNull(),
  setName: varchar("setName", { length: 160 }).notNull(),
  sourceUrl: text("sourceUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collectionItems = mysqlTable("collectionItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cardId: int("cardId").notNull(),
  quantity: int("quantity").notNull().default(1),
  condition: varchar("condition", { length: 32 }).default("NM").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const cardScans = mysqlTable("cardScans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cardId: int("cardId"),
  frontImageUrl: text("frontImageUrl"),
  backImageUrl: text("backImageUrl"),
  recognitionStatus: mysqlEnum("recognitionStatus", ["pending", "matched", "review"]).default("matched").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const priceSnapshots = mysqlTable("priceSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  cardId: int("cardId").notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
  marketCents: int("marketCents").notNull(),
  lowCents: int("lowCents"),
  highCents: int("highCents"),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

export const decks = mysqlTable("decks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const deckCards = mysqlTable("deckCards", {
  id: int("id").autoincrement().primaryKey(),
  deckId: int("deckId").notNull(),
  cardId: int("cardId").notNull(),
  quantity: int("quantity").notNull().default(1),
  slot: mysqlEnum("slot", ["legend", "main"]).notNull(),
});

export const deckShares = mysqlTable("deckShares", {
  id: int("id").autoincrement().primaryKey(),
  deckId: int("deckId").notNull(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 32 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
});

export const activityEvents = mysqlTable("activityEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["scan", "deck", "recommendation", "collection"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type CardScan = typeof cardScans.$inferSelect;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type Deck = typeof decks.$inferSelect;
export type DeckCard = typeof deckCards.$inferSelect;
export type DeckShare = typeof deckShares.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
