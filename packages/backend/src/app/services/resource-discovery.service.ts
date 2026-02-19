/**
 * Resource Discovery Service — fetches resources from all configured integrations
 * and infers relationships between them.
 */
import { v4 as uuidv4 } from 'uuid';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';

import { Setting } from '../models/setting.model';
import { getAwsCredentials } from '../../lib/integrations/aws/index';
import { nerdgraph } from '../../lib/integrations/newrelic/client';
import { getNewRelicCredentials } from '../../lib/integrations/newrelic/index';
import { pdPaginate } from '../../lib/integrations/pagerduty/client';
import { getPagerDutyCredentials } from '../../lib/integrations/pagerduty/index';
import { normalizeName, extractServiceTags } from '../../lib/utils/name-matcher';
import { logger } from '../../lib/utils/logger';
import type { ResourceNode, ResourceEdge } from '../../types/index';

const NR_ENTITY_QUERY = `
query ListEntities($query: String, $cursor: String) {
  actor {
    entitySearch(query: $query) {
      results(cursor: $cursor) {
        entities {
          guid
          name
          entityType
          domain
          type
          reporting
          alertSeverity
        }
        nextCursor
      }
      count
    }
  }
}
`;

export class ResourceDiscoveryService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Discover resources from all configured integrations, infer edges.
   * Each integration can have multiple instances (accounts).
   */
  async syncAll(): Promise<{ nodes: ResourceNode[]; edges: ResourceEdge[] }> {
    const discoveryTasks: Promise<ResourceNode[]>[] = [];

    // Launch discovery for every instance of each integration
    const awsInstances = Setting.getInstances(this.accountId, 'aws');
    for (let i = 0; i < awsInstances.length; i++) {
      discoveryTasks.push(this.discoverAws(i));
    }

    const nrInstances = Setting.getInstances(this.accountId, 'newrelic');
    for (let i = 0; i < nrInstances.length; i++) {
      discoveryTasks.push(this.discoverNewRelic(i));
    }

    const pdInstances = Setting.getInstances(this.accountId, 'pagerduty');
    for (let i = 0; i < pdInstances.length; i++) {
      discoveryTasks.push(this.discoverPagerDuty(i));
    }

    const sentryInstances = Setting.getInstances(this.accountId, 'sentry');
    for (let i = 0; i < sentryInstances.length; i++) {
      discoveryTasks.push(this.discoverSentry(i));
    }

    const results = await Promise.allSettled(discoveryTasks);

    const allNodes: ResourceNode[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allNodes.push(...result.value);
      } else {
        logger.warn({ error: result.reason?.message }, 'Discovery task failed');
      }
    }

    return { nodes: allNodes, edges: [] };
  }

  /**
   * Merge discovered resources with an existing graph, preserving user positions
   * and manually-added nodes/edges. Re-infers edges on the full merged node set
   * so all cross-platform connections are found.
   */
  mergeWithExisting(
    existingNodes: ResourceNode[],
    existingEdges: ResourceEdge[],
    discoveredNodes: ResourceNode[],
  ): { nodes: ResourceNode[]; edges: ResourceEdge[] } {
    const { nodes } = this.mergeNodes(existingNodes, discoveredNodes);

    // Infer edges on the full merged node set (not just discovered)
    const inferredEdges = this.inferEdges(nodes);

    // Preserve manually-added edges and merge with inferred ones
    const manualEdges = existingEdges.filter((e) => e.type === 'manual');
    const edges = this.mergeEdges(manualEdges, inferredEdges, nodes);

    return { nodes, edges };
  }

  // ── Private discovery methods ──

  private async discoverAws(index: number): Promise<ResourceNode[]> {
    const nodes: ResourceNode[] = [];
    const creds = getAwsCredentials(this.accountId, index);
    const credConfig = {
      region: creds.region,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    };

    // EC2
    try {
      const ec2 = new EC2Client(credConfig);
      const resp = await ec2.send(new DescribeInstancesCommand({}));
      const instances = (resp.Reservations || []).flatMap((r) => r.Instances || []);

      for (const i of instances) {
        const tags = Object.fromEntries((i.Tags || []).map((t) => [t.Key || '', t.Value || '']));
        const name = tags['Name'] || i.InstanceId || 'unnamed';
        const serviceTags = extractServiceTags(i.Tags);

        nodes.push({
          id: uuidv4(),
          name,
          normalizedName: normalizeName(name),
          type: 'ec2',
          source: 'aws',
          externalId: i.InstanceId,
          attrs: {
            instanceType: i.InstanceType || '',
            state: i.State?.Name || '',
            vpcId: i.VpcId || '',
            subnetId: i.SubnetId || '',
            securityGroups: (i.SecurityGroups || []).map((sg) => sg.GroupId).filter(Boolean).join(','),
            privateIp: i.PrivateIpAddress || '',
            publicIp: i.PublicIpAddress || '',
            ...serviceTags,
          },
        });
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'EC2 discovery failed');
    }

    // RDS
    try {
      const rds = new RDSClient(credConfig);
      const resp = await rds.send(new DescribeDBInstancesCommand({}));

      for (const db of resp.DBInstances || []) {
        const name = db.DBInstanceIdentifier || 'unnamed';
        nodes.push({
          id: uuidv4(),
          name,
          normalizedName: normalizeName(name),
          type: 'rds',
          source: 'aws',
          externalId: db.DbiResourceId || db.DBInstanceIdentifier,
          attrs: {
            engine: db.Engine || '',
            engineVersion: db.EngineVersion || '',
            instanceClass: db.DBInstanceClass || '',
            status: db.DBInstanceStatus || '',
            multiAz: String(db.MultiAZ ?? false),
            endpoint: db.Endpoint?.Address || '',
          },
        });
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'RDS discovery failed');
    }

    // Lambda
    try {
      const lambda = new LambdaClient(credConfig);
      const resp = await lambda.send(new ListFunctionsCommand({}));

      for (const fn of resp.Functions || []) {
        const name = fn.FunctionName || 'unnamed';
        nodes.push({
          id: uuidv4(),
          name,
          normalizedName: normalizeName(name),
          type: 'lambda',
          source: 'aws',
          externalId: fn.FunctionArn,
          attrs: {
            runtime: fn.Runtime || '',
            memorySize: String(fn.MemorySize || ''),
            timeout: String(fn.Timeout || ''),
            state: fn.State || '',
            handler: fn.Handler || '',
          },
        });
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Lambda discovery failed');
    }

    return nodes;
  }

  private async discoverNewRelic(index: number): Promise<ResourceNode[]> {
    // Verify credentials are available
    getNewRelicCredentials(this.accountId, index);

    const data = await nerdgraph<any>(this.accountId, NR_ENTITY_QUERY, {
      query: "domain = 'APM' AND type = 'APPLICATION'",
      cursor: null,
    });

    const entities = data.actor.entitySearch.results.entities || [];

    return entities.map((e: any) => ({
      id: uuidv4(),
      name: e.name,
      normalizedName: normalizeName(e.name),
      type: 'newrelic_app',
      source: 'newrelic',
      externalId: e.guid,
      attrs: {
        entityType: e.entityType || '',
        domain: e.domain || '',
        reporting: String(e.reporting ?? ''),
        alertSeverity: e.alertSeverity || '',
      },
    }));
  }

  private async discoverPagerDuty(index: number): Promise<ResourceNode[]> {
    // Verify credentials
    getPagerDutyCredentials(this.accountId, index);

    const services = await pdPaginate<any>(this.accountId, '/services', 'services');

    return services.map((s: any) => ({
      id: uuidv4(),
      name: s.name,
      normalizedName: normalizeName(s.name),
      type: 'pagerduty_service',
      source: 'pagerduty',
      externalId: s.id,
      attrs: {
        status: s.status || '',
        description: s.description || '',
        escalationPolicy: s.escalation_policy?.summary || '',
      },
    }));
  }

  private async discoverSentry(index: number): Promise<ResourceNode[]> {
    const authToken = Setting.get(this.accountId, `sentry.${index}.auth_token`);
    const org = Setting.get(this.accountId, `sentry.${index}.org`);

    if (!authToken || !org) return [];

    try {
      const response = await fetch(`https://sentry.io/api/0/organizations/${org}/projects/`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        logger.warn({ status: response.status, org }, 'Sentry projects API failed');
        return [];
      }

      const projects = (await response.json()) as any[];

      return projects.map((p: any) => ({
        id: uuidv4(),
        name: p.name || p.slug || 'unnamed',
        normalizedName: normalizeName(p.name || p.slug || 'unnamed'),
        type: 'sentry_project',
        source: 'sentry',
        externalId: p.slug || p.id,
        attrs: {
          slug: p.slug || '',
          platform: p.platform || '',
          status: p.status || '',
        },
      }));
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Sentry discovery failed');
      return [];
    }
  }

  // ── Edge inference ──

  private inferEdges(nodes: ResourceNode[]): ResourceEdge[] {
    const edges: ResourceEdge[] = [];
    const seenPairs = new Set<string>();

    const addEdge = (sourceId: string, targetId: string, type: string, label: string, confidence: number) => {
      const key = [sourceId, targetId].sort().join(':');
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      edges.push({
        id: uuidv4(),
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        type,
        label,
        confidence,
      });
    };

    // 1. Cross-platform name matching
    const byNormalized = new Map<string, ResourceNode[]>();
    for (const node of nodes) {
      if (!node.normalizedName) continue;
      const existing = byNormalized.get(node.normalizedName) || [];
      existing.push(node);
      byNormalized.set(node.normalizedName, existing);
    }

    for (const [, group] of byNormalized) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (group[i].source !== group[j].source) {
            addEdge(group[i].id, group[j].id, 'name_match', 'Name match', 0.8);
          }
        }
      }
    }

    // 2. AWS security group sharing
    const awsNodes = nodes.filter((n) => n.source === 'aws' && n.attrs.securityGroups);
    for (let i = 0; i < awsNodes.length; i++) {
      const sgsA = new Set(awsNodes[i].attrs.securityGroups.split(',').filter(Boolean));
      for (let j = i + 1; j < awsNodes.length; j++) {
        const sgsB = new Set(awsNodes[j].attrs.securityGroups.split(',').filter(Boolean));
        const overlap = [...sgsA].some((sg) => sgsB.has(sg));
        if (overlap) {
          addEdge(awsNodes[i].id, awsNodes[j].id, 'security_group', 'Shared SG', 0.7);
        }
      }
    }

    // 3. AWS subnet grouping
    const bySubnet = new Map<string, ResourceNode[]>();
    for (const node of awsNodes) {
      if (!node.attrs.subnetId) continue;
      const existing = bySubnet.get(node.attrs.subnetId) || [];
      existing.push(node);
      bySubnet.set(node.attrs.subnetId, existing);
    }

    for (const [, group] of bySubnet) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          addEdge(group[i].id, group[j].id, 'subnet_group', 'Same subnet', 0.9);
        }
      }
    }

    // 4. Tag-based linking: AWS tag values matched against normalized names
    for (const awsNode of nodes.filter((n) => n.source === 'aws')) {
      const tagValues = Object.values(awsNode.attrs)
        .filter((v) => v && typeof v === 'string')
        .map(normalizeName)
        .filter((v) => v.length > 2);

      for (const other of nodes) {
        if (other.id === awsNode.id || other.source === awsNode.source) continue;
        if (tagValues.includes(other.normalizedName)) {
          addEdge(awsNode.id, other.id, 'tag_link', 'Tag match', 0.85);
        }
      }
    }

    return edges;
  }

  // ── Merge logic ──

  private mergeNodes(
    existing: ResourceNode[],
    discovered: ResourceNode[],
  ): { nodes: ResourceNode[] } {
    const positionMap = new Map<string, { x: number; y: number }>();
    const existingByKey = new Map<string, ResourceNode>();
    const matchedExistingIds = new Set<string>();

    for (const node of existing) {
      const key = `${node.source}:${node.externalId}`;
      existingByKey.set(key, node);
      if (node.position) {
        positionMap.set(key, node.position);
      }
    }

    const merged: ResourceNode[] = [];

    // Merge discovered nodes, preserving existing IDs and positions
    for (const node of discovered) {
      const key = `${node.source}:${node.externalId}`;
      const position = positionMap.get(key);
      const existingNode = existingByKey.get(key);

      if (existingNode) {
        matchedExistingIds.add(existingNode.id);
      }

      merged.push({
        ...node,
        id: existingNode?.id || node.id,
        position: position || node.position,
      });
    }

    // Preserve manually-added nodes (not matched by discovery)
    for (const node of existing) {
      if (!matchedExistingIds.has(node.id)) {
        merged.push(node);
      }
    }

    return { nodes: merged };
  }

  private mergeEdges(
    manualEdges: ResourceEdge[],
    inferredEdges: ResourceEdge[],
    mergedNodes: ResourceNode[],
  ): ResourceEdge[] {
    const nodeIds = new Set(mergedNodes.map((n) => n.id));
    const seenPairs = new Set<string>();
    const merged: ResourceEdge[] = [];

    // Keep manual edges first (user-created, highest priority)
    for (const edge of manualEdges) {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
      const key = [edge.sourceNodeId, edge.targetNodeId].sort().join(':');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      merged.push(edge);
    }

    // Add inferred edges (skip duplicates of manual edges)
    for (const edge of inferredEdges) {
      const key = [edge.sourceNodeId, edge.targetNodeId].sort().join(':');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      merged.push(edge);
    }

    return merged;
  }
}
