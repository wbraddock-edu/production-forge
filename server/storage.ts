import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import {
  projects,
  items,
  referenceImages,
  type Project,
  type InsertProject,
  type Item,
  type InsertItem,
  type ReferenceImage,
  type InsertReferenceImage,
} from "@shared/schema";

const sqlite = new Database("production-forge.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source_text TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'story',
    art_style TEXT NOT NULL DEFAULT 'cinematic',
    provider TEXT NOT NULL DEFAULT 'google',
    api_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    scan_data_json TEXT NOT NULL,
    profile_json TEXT,
    visual_images_json TEXT,
    status TEXT NOT NULL DEFAULT 'scanned',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reference_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    base64_data TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export interface IStorage {
  // Projects
  createProject(data: InsertProject): Project;
  getProject(id: number): Project | undefined;
  listProjects(): Project[];
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(id: number): void;

  // Items
  createItem(data: InsertItem): Item;
  getItem(id: number): Item | undefined;
  updateItem(id: number, data: Partial<InsertItem>): Item | undefined;
  deleteItem(id: number): void;
  getItemsByProject(projectId: number): Item[];
  getItemsByProjectAndType(projectId: number, type: string): Item[];

  // Reference images
  createReferenceImage(data: InsertReferenceImage): ReferenceImage;
  getReferenceImagesByProject(projectId: number): ReferenceImage[];
  deleteReferenceImage(id: number): void;
}

class SqliteStorage implements IStorage {
  // ── Projects ──
  createProject(data: InsertProject): Project {
    return db.insert(projects).values(data).returning().get();
  }

  getProject(id: number): Project | undefined {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  }

  listProjects(): Project[] {
    return db.select().from(projects).all();
  }

  updateProject(id: number, data: Partial<InsertProject>): Project | undefined {
    return db
      .update(projects)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, id))
      .returning()
      .get();
  }

  deleteProject(id: number): void {
    db.delete(items).where(eq(items.projectId, id)).run();
    db.delete(referenceImages).where(eq(referenceImages.projectId, id)).run();
    db.delete(projects).where(eq(projects.id, id)).run();
  }

  // ── Items ──
  createItem(data: InsertItem): Item {
    return db.insert(items).values(data).returning().get();
  }

  getItem(id: number): Item | undefined {
    return db.select().from(items).where(eq(items.id, id)).get();
  }

  updateItem(id: number, data: Partial<InsertItem>): Item | undefined {
    return db.update(items).set(data).where(eq(items.id, id)).returning().get();
  }

  deleteItem(id: number): void {
    db.delete(items).where(eq(items.id, id)).run();
  }

  getItemsByProject(projectId: number): Item[] {
    return db.select().from(items).where(eq(items.projectId, projectId)).all();
  }

  getItemsByProjectAndType(projectId: number, type: string): Item[] {
    return db
      .select()
      .from(items)
      .where(and(eq(items.projectId, projectId), eq(items.type, type)))
      .all();
  }

  // ── Reference Images ──
  createReferenceImage(data: InsertReferenceImage): ReferenceImage {
    return db.insert(referenceImages).values(data).returning().get();
  }

  getReferenceImagesByProject(projectId: number): ReferenceImage[] {
    return db
      .select()
      .from(referenceImages)
      .where(eq(referenceImages.projectId, projectId))
      .all();
  }

  deleteReferenceImage(id: number): void {
    db.delete(referenceImages).where(eq(referenceImages.id, id)).run();
  }
}

export const storage = new SqliteStorage();
