import { eq, desc, and } from 'drizzle-orm';
import { getDatabase } from '../../config/database';
import { resourceMaps } from '../../db/schema';
import type { ResourceMap, ResourceMapSummary, ResourceNode, ResourceEdge, ResourceGroup } from '../../types/index';
import { v4 as uuidv4 } from 'uuid';

export class ResourceMapModel {
  static create(accountId: string, name: string, description?: string): ResourceMap {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    const row = db
      .insert(resourceMaps)
      .values({
        id,
        accountId,
        name,
        description: description || null,
        nodes: [],
        edges: [],
        groups: [],
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: row.nodes as ResourceNode[],
      edges: row.edges as ResourceEdge[],
      groups: (row.groups as ResourceGroup[]) || [],
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
    };
  }

  static find(accountId: string, id: string): ResourceMap | null {
    const db = getDatabase();
    const row = db
      .select()
      .from(resourceMaps)
      .where(and(eq(resourceMaps.id, id), eq(resourceMaps.accountId, accountId)))
      .get();

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: row.nodes as ResourceNode[],
      edges: row.edges as ResourceEdge[],
      groups: (row.groups as ResourceGroup[]) || [],
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
    };
  }

  /**
   * Load all full resource maps (with nodes/edges/groups) for an account.
   * Only returns maps that have at least one group defined.
   */
  static allWithGroups(accountId: string): ResourceMap[] {
    const db = getDatabase();
    const rows = db
      .select()
      .from(resourceMaps)
      .where(eq(resourceMaps.accountId, accountId))
      .all();

    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        nodes: row.nodes as ResourceNode[],
        edges: row.edges as ResourceEdge[],
        groups: (row.groups as ResourceGroup[]) || [],
        lastSyncedAt: row.lastSyncedAt,
        createdAt: row.createdAt!,
        updatedAt: row.updatedAt!,
      }))
      .filter((m) => m.groups.length > 0);
  }

  static all(accountId: string): ResourceMapSummary[] {
    const db = getDatabase();
    const rows = db
      .select()
      .from(resourceMaps)
      .where(eq(resourceMaps.accountId, accountId))
      .orderBy(desc(resourceMaps.updatedAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      nodeCount: (row.nodes as unknown[]).length,
      edgeCount: (row.edges as unknown[]).length,
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
    }));
  }

  static update(accountId: string, id: string, data: { name?: string; description?: string }): void {
    const db = getDatabase();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;

    db.update(resourceMaps)
      .set(updates)
      .where(and(eq(resourceMaps.id, id), eq(resourceMaps.accountId, accountId)))
      .run();
  }

  static saveGraph(accountId: string, id: string, nodes: ResourceNode[], edges: ResourceEdge[], groups?: ResourceGroup[]): void {
    const db = getDatabase();
    const updates: Record<string, unknown> = {
      nodes: nodes as unknown[],
      edges: edges as unknown[],
      updatedAt: new Date(),
    };
    if (groups !== undefined) {
      updates.groups = groups as unknown[];
    }
    db.update(resourceMaps)
      .set(updates)
      .where(and(eq(resourceMaps.id, id), eq(resourceMaps.accountId, accountId)))
      .run();
  }

  static updateLastSyncedAt(accountId: string, id: string): void {
    const db = getDatabase();
    db.update(resourceMaps)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(resourceMaps.id, id), eq(resourceMaps.accountId, accountId)))
      .run();
  }

  static destroy(accountId: string, id: string): void {
    const db = getDatabase();
    db.delete(resourceMaps)
      .where(and(eq(resourceMaps.id, id), eq(resourceMaps.accountId, accountId)))
      .run();
  }
}

export default ResourceMapModel;
