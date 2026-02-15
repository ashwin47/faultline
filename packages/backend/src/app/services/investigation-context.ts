
/**
 * JSON-safe snapshot of InvestigationContext for persistence across turns.
 */
/**
 * A discovered resource from a cloud/monitoring platform.
 */
export interface ResourceEntry {
  /** Display name or identifier */
  name: string;
  /** Platform-specific ID (e.g. DbiResourceId, GUID, ARN) */
  id?: string;
  /** Resource type (e.g. "rds", "ec2", "lambda", "newrelic_app") */
  type: string;
  /** Extra attributes worth propagating (e.g. engine, status, region) */
  attrs?: Record<string, string>;
}

/**
 * JSON-safe snapshot of InvestigationContext for persistence across turns.
 */
export interface InvestigationContextSnapshot {
  timeWindow: {
    description: string;
    start: string | null;
    end: string | null;
    extracted: boolean;
  };
  entities: Record<string, string[]>;
  identifiers: {
    serviceNames: string[];
    errorMessages: string[];
    transactionNames: string[];
    hostnames: string[];
    regions: string[];
  };
  resources: ResourceEntry[];
  scopedGroupName?: string;
}

/**
 * Tracks investigation state across the agent loop.
 * Extracts time windows, entity names, and key identifiers from tool results
 * and injects them as context so the model uses consistent parameters.
 */

export class InvestigationContext {
  /** The time window the investigation is focused on */
  timeWindow: { description: string; start: Date | null; end: Date | null; extracted: boolean } = {
    description: 'last 24 hours',
    start: null,
    end: null,
    extracted: false,
  };

  /** Discovered entity names per platform */
  entities: Map<string, string[]> = new Map();

  /** Key identifiers extracted from tool results */
  identifiers: {
    serviceNames: Set<string>;
    errorMessages: Set<string>;
    transactionNames: Set<string>;
    hostnames: Set<string>;
    regions: Set<string>;
  } = {
    serviceNames: new Set(),
    errorMessages: new Set(),
    transactionNames: new Set(),
    hostnames: new Set(),
    regions: new Set(),
  };

  /** Discovered resources from cloud/monitoring platforms */
  resources: ResourceEntry[] = [];

  /** When scoped to a resource group, the group name */
  scopedGroupName?: string;

  /**
   * Parse the user's message to extract an initial time window.
   */
  parseUserMessage(message: string): void {
    const lower = message.toLowerCase();
    const now = new Date();

    if (/last\s+(\d+)\s+hour/.test(lower)) {
      const hours = parseInt(lower.match(/last\s+(\d+)\s+hour/)![1], 10);
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      this.timeWindow = { description: `last ${hours} hours`, start, end: now, extracted: true };
    } else if (/last\s+(\d+)\s+day/.test(lower)) {
      const days = parseInt(lower.match(/last\s+(\d+)\s+day/)![1], 10);
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      this.timeWindow = { description: `last ${days} days`, start, end: now, extracted: true };
    } else if (/last\s+(\d+)\s+min/.test(lower)) {
      const mins = parseInt(lower.match(/last\s+(\d+)\s+min/)![1], 10);
      const start = new Date(now.getTime() - mins * 60 * 1000);
      this.timeWindow = { description: `last ${mins} minutes`, start, end: now, extracted: true };
    } else if (/today|last 24|past 24/.test(lower)) {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      this.timeWindow = { description: 'last 24 hours', start, end: now, extracted: true };
    } else if (/this week|past week|last 7|last week/.test(lower)) {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      this.timeWindow = { description: 'last 7 days', start, end: now, extracted: true };
    } else if (/this month|past month|last 30/.test(lower)) {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      this.timeWindow = { description: 'last 30 days', start, end: now, extracted: true };
    } else {
      // Default: last 24 hours
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      this.timeWindow = { description: 'last 24 hours', start, end: now, extracted: false };
    }
  }

  /**
   * Extract useful identifiers from a tool result.
   */
  extractFromToolResult(toolName: string, integration: string | undefined, args: Record<string, unknown>, result: unknown): void {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    // ── Resource discovery ────────────────────────────────────────
    // Extract resources from discovery tools so they're available in
    // context for all subsequent queries (no need to re-discover).

    this.extractResources(toolName, integration, resultStr);

    // ── AWS regions ──────────────────────────────────────────────
    if (integration === 'aws') {
      if (args.region && typeof args.region === 'string') {
        this.identifiers.regions.add(args.region);
      }
      const regionMatches = resultStr.match(/(?:us|eu|ap|sa|ca|me|af)-(?:east|west|north|south|central|northeast|southeast|northwest|southwest)-\d/g);
      if (regionMatches) {
        for (const r of regionMatches) this.identifiers.regions.add(r);
      }
    }

    // ── Hostnames ────────────────────────────────────────────────
    const hostMatches = resultStr.match(/(?:ip-[\d-]+|i-[0-9a-f]{8,17}|[\w-]+\.(?:compute|ec2)\.amazonaws\.com)/g);
    if (hostMatches) {
      for (const h of hostMatches.slice(0, 5)) this.identifiers.hostnames.add(h);
    }

    // ── PagerDuty incident timestamps ────────────────────────────
    if (integration === 'pagerduty') {
      const timeMatch = resultStr.match(/"created_at"\s*:\s*"([^"]+)"/);
      if (timeMatch) {
        try {
          const incidentTime = new Date(timeMatch[1]);
          if (!isNaN(incidentTime.getTime())) {
            const start = new Date(incidentTime.getTime() - 60 * 60 * 1000);
            const end = new Date(incidentTime.getTime() + 60 * 60 * 1000);
            this.timeWindow = {
              description: `around incident time ${incidentTime.toISOString()}`,
              start,
              end,
              extracted: true,
            };
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // ── Entity names (legacy — still feeds identifiers) ──────────
    if (integration === 'newrelic') {
      const appNameMatches = resultStr.match(/"appName"\s*:\s*"([^"]+)"/g);
      if (appNameMatches) {
        const names = appNameMatches.map(m => m.match(/"appName"\s*:\s*"([^"]+)"/)![1]);
        this.entities.set('newrelic', [...new Set([...(this.entities.get('newrelic') || []), ...names])]);
        for (const n of names) this.identifiers.serviceNames.add(n);
      }
    }

    if (integration === 'sentry') {
      const slugMatches = resultStr.match(/"slug"\s*:\s*"([^"]+)"/g);
      if (slugMatches) {
        const slugs = slugMatches.map(m => m.match(/"slug"\s*:\s*"([^"]+)"/)![1]);
        this.entities.set('sentry', [...new Set([...(this.entities.get('sentry') || []), ...slugs])]);
      }
    }

    if (integration === 'pagerduty') {
      const svcMatches = resultStr.match(/"name"\s*:\s*"([^"]+)"/g);
      if (svcMatches) {
        const names = svcMatches.map(m => m.match(/"name"\s*:\s*"([^"]+)"/)![1]).filter(n => n.length > 2 && n.length < 60);
        this.entities.set('pagerduty', [...new Set([...(this.entities.get('pagerduty') || []), ...names])]);
      }
    }

    // ── Error messages ───────────────────────────────────────────
    const errorMatches = resultStr.match(/"(?:error|message|title)"\s*:\s*"([^"]{10,120})"/g);
    if (errorMatches) {
      for (const m of errorMatches.slice(0, 3)) {
        const val = m.match(/"(?:error|message|title)"\s*:\s*"([^"]+)"/)![1];
        this.identifiers.errorMessages.add(val);
      }
    }

    // ── Transaction names ────────────────────────────────────────
    if (integration === 'newrelic') {
      const txnMatches = resultStr.match(/"name"\s*:\s*"(WebTransaction[^"]+)"/g);
      if (txnMatches) {
        for (const m of txnMatches.slice(0, 5)) {
          const val = m.match(/"name"\s*:\s*"([^"]+)"/)![1];
          this.identifiers.transactionNames.add(val);
        }
      }
    }
  }

  /**
   * Extract resource entries from discovery tool results.
   * Deduplicates by type+name so repeated calls don't bloat the inventory.
   */
  private extractResources(toolName: string, _integration: string | undefined, resultStr: string): void {
    try {
      const data = JSON.parse(resultStr);

      // ── AWS resources (from call_aws MCP tool or legacy custom tools) ──
      // Parse based on response structure since all AWS calls go through call_aws now.

      // RDS instances
      if (data.DBInstances && Array.isArray(data.DBInstances)) {
        for (const db of data.DBInstances) {
          this.addResource({
            name: db.DBInstanceIdentifier,
            id: db.DbiResourceId,
            type: 'rds',
            attrs: {
              engine: `${db.Engine || ''}/${db.EngineVersion || ''}`,
              status: db.DBInstanceStatus || '',
              class: db.DBInstanceClass || '',
              endpoint: db.Endpoint?.Address || '',
              piEnabled: String(db.PerformanceInsightsEnabled ?? false),
            },
          });
        }
      }

      // EC2 instances (from describe-instances Reservations)
      if (data.Reservations && Array.isArray(data.Reservations)) {
        for (const res of data.Reservations) {
          for (const inst of (res.Instances || [])) {
            const nameTag = inst.Tags?.find((t: any) => t.Key === 'Name')?.Value;
            this.addResource({
              name: nameTag || inst.InstanceId,
              id: inst.InstanceId,
              type: 'ec2',
              attrs: {
                state: inst.State?.Name || '',
                instanceType: inst.InstanceType || '',
                az: inst.Placement?.AvailabilityZone || '',
              },
            });
          }
        }
      }

      // Lambda functions
      if (data.Functions && Array.isArray(data.Functions)) {
        for (const fn of data.Functions) {
          this.addResource({
            name: fn.FunctionName,
            id: fn.FunctionArn,
            type: 'lambda',
            attrs: {
              runtime: fn.Runtime || '',
              memory: String(fn.MemorySize || ''),
            },
          });
        }
      }

      // CloudWatch log groups
      if (data.logGroups && Array.isArray(data.logGroups)) {
        for (const lg of data.logGroups) {
          this.addResource({
            name: lg.logGroupName,
            type: 'log_group',
            attrs: {
              retentionDays: String(lg.retentionInDays ?? 'never'),
            },
          });
        }
      }

      // ── New Relic entities ─────────────────────────────────────
      if (toolName === 'nr_list_entities' && data.entities) {
        for (const ent of data.entities) {
          this.addResource({
            name: ent.name,
            id: ent.guid,
            type: 'newrelic_app',
            attrs: {
              entityType: ent.entityType || ent.type || '',
              language: ent.language || '',
              reporting: String(ent.reporting ?? ''),
            },
          });
        }
      }

      // ── Sentry projects ──────────────────────────────────────────
      // Sentry MCP tools wrap results in a { content: [{ text }] } structure.
      // Parse the inner text for project data. Works for list_projects,
      // list_issues, and any tool that returns project slugs.
      this.extractSentryResources(toolName, resultStr);

      // ── New Relic golden metrics entity ────────────────────────
      if (toolName === 'nr_get_entity_golden_metrics' && data.entity) {
        const ent = data.entity;
        this.addResource({
          name: ent.name,
          id: ent.guid,
          type: 'newrelic_app',
          attrs: {
            entityType: ent.entityType || '',
          },
        });
      }

    } catch {
      // Result isn't valid JSON — skip resource extraction
    }
  }

  /**
   * Extract Sentry project resources from MCP tool results.
   * Sentry MCP wraps results in { content: [{ type: "text", text: "..." }] }.
   * Also handles raw JSON arrays/objects with project-like structures.
   */
  private extractSentryResources(toolName: string, resultStr: string): void {
    // Only process Sentry-related tool names
    if (!/list_project|list_issue|get_issue|search_issue|get_project/i.test(toolName)) return;

    try {
      // Try to find project objects — could be in MCP content wrapper or raw JSON
      // MCP format: { content: [{ type: "text", text: "[{...}]" }] }
      let projectData: any[] = [];

      const outer = JSON.parse(resultStr);

      // MCP content wrapper
      if (outer.content && Array.isArray(outer.content)) {
        for (const block of outer.content) {
          if (block.type === 'text' && block.text) {
            try {
              const inner = JSON.parse(block.text);
              if (Array.isArray(inner)) projectData.push(...inner);
              else if (inner && typeof inner === 'object') projectData.push(inner);
            } catch { /* text isn't JSON, skip */ }
          }
        }
      }

      // Direct array
      if (Array.isArray(outer)) {
        projectData = outer;
      }

      // Extract projects from list_projects-style results
      for (const item of projectData) {
        if (item.slug || item.project_slug) {
          const slug = item.slug || item.project_slug;
          this.addResource({
            name: slug,
            id: item.id ? String(item.id) : undefined,
            type: 'sentry_project',
            attrs: {
              name: item.name || '',
              platform: item.platform || '',
              status: item.status || '',
            },
          });
        }

        // Issues also carry a project reference
        if (item.project && typeof item.project === 'object') {
          const proj = item.project;
          if (proj.slug) {
            this.addResource({
              name: proj.slug,
              id: proj.id ? String(proj.id) : undefined,
              type: 'sentry_project',
              attrs: {
                name: proj.name || '',
                platform: proj.platform || '',
              },
            });
          }
        }
      }
    } catch {
      // Not parseable — try regex fallback for project slugs in the raw string
      const slugMatches = resultStr.match(/"(?:slug|project_slug)"\s*:\s*"([^"]+)"/g);
      if (slugMatches) {
        for (const m of slugMatches) {
          const slug = m.match(/"(?:slug|project_slug)"\s*:\s*"([^"]+)"/)![1];
          this.addResource({ name: slug, type: 'sentry_project' });
        }
      }
    }
  }

  /**
   * Add a resource, deduplicating by type+name.
   * If a resource with the same type+name exists, merge attrs.
   */
  private addResource(entry: ResourceEntry): void {
    if (!entry.name) return;
    const idx = this.resources.findIndex(r => r.type === entry.type && r.name === entry.name);
    if (idx >= 0) {
      // Merge attrs
      this.resources[idx] = {
        ...this.resources[idx],
        id: entry.id || this.resources[idx].id,
        attrs: { ...this.resources[idx].attrs, ...entry.attrs },
      };
    } else {
      this.resources.push(entry);
    }
  }

  /**
   * Build a context summary to inject before each model turn.
   * Returns null if no useful context has been gathered yet.
   */
  buildContextMessage(): string | null {
    const parts: string[] = [];

    // Time window — concrete ISO timestamps the model can use or compare against
    if (this.timeWindow.start && this.timeWindow.end) {
      // Pad start back by 30 minutes so queries catch error onset
      const paddedStart = new Date(this.timeWindow.start.getTime() - 30 * 60 * 1000);
      const windowMs = this.timeWindow.end.getTime() - this.timeWindow.start.getTime();
      const isBroad = windowMs > 3 * 24 * 60 * 60 * 1000; // > 3 days

      parts.push(
        `**Investigation time window:** ${this.timeWindow.description}\n` +
        `  start: ${this.timeWindow.start.toISOString()}\n` +
        `  end:   ${this.timeWindow.end.toISOString()}\n` +
        `  query_start (padded -30min): ${paddedStart.toISOString()}`
      );

      if (isBroad) {
        parts.push(
          `⚠️ This is a broad time window. Start with it to identify spikes/clusters, then narrow to the specific time range where the problem is concentrated.`
        );
      }
    } else {
      parts.push(`**Investigation time window:** ${this.timeWindow.description}`);
    }

    // Discovered entities
    if (this.entities.size > 0) {
      parts.push('\n**Discovered entities (use the correct name for each platform):**');
      for (const [platform, names] of this.entities) {
        parts.push(`- ${platform}: ${names.join(', ')}`);
      }
    }

    // Extracted identifiers
    const ids: string[] = [];
    if (this.identifiers.regions.size > 0) {
      ids.push(`AWS regions: ${[...this.identifiers.regions].join(', ')}`);
    }
    if (this.identifiers.serviceNames.size > 0) {
      ids.push(`Service names: ${[...this.identifiers.serviceNames].slice(0, 5).join(', ')}`);
    }
    if (this.identifiers.errorMessages.size > 0) {
      ids.push(`Error messages: ${[...this.identifiers.errorMessages].slice(0, 3).join(' | ')}`);
    }
    if (this.identifiers.transactionNames.size > 0) {
      ids.push(`Transactions: ${[...this.identifiers.transactionNames].slice(0, 3).join(', ')}`);
    }
    if (this.identifiers.hostnames.size > 0) {
      ids.push(`Hostnames: ${[...this.identifiers.hostnames].slice(0, 3).join(', ')}`);
    }

    if (ids.length > 0) {
      parts.push('\n**Extracted identifiers:**');
      for (const id of ids) {
        parts.push(`- ${id}`);
      }
    }

    // Resource inventory
    if (this.resources.length > 0) {
      parts.push('\n**Discovered Resources (use these exact names/IDs — do NOT re-discover):**');
      const byType = new Map<string, ResourceEntry[]>();
      for (const r of this.resources) {
        const list = byType.get(r.type) || [];
        list.push(r);
        byType.set(r.type, list);
      }
      for (const [type, entries] of byType) {
        parts.push(`\n_${type}:_`);
        for (const r of entries) {
          const idPart = r.id ? ` (id: ${r.id})` : '';
          const attrParts = r.attrs
            ? Object.entries(r.attrs).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')
            : '';
          parts.push(`- ${r.name}${idPart}${attrParts ? ` [${attrParts}]` : ''}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Serialize to a plain JSON-safe object for persistence.
   */
  toJSON(): InvestigationContextSnapshot {
    return {
      timeWindow: {
        description: this.timeWindow.description,
        start: this.timeWindow.start?.toISOString() ?? null,
        end: this.timeWindow.end?.toISOString() ?? null,
        extracted: this.timeWindow.extracted,
      },
      entities: Object.fromEntries(this.entities),
      identifiers: {
        serviceNames: [...this.identifiers.serviceNames],
        errorMessages: [...this.identifiers.errorMessages],
        transactionNames: [...this.identifiers.transactionNames],
        hostnames: [...this.identifiers.hostnames],
        regions: [...this.identifiers.regions],
      },
      resources: this.resources,
      ...(this.scopedGroupName ? { scopedGroupName: this.scopedGroupName } : {}),
    };
  }

  /**
   * Restore an InvestigationContext from a persisted snapshot.
   */
  static fromJSON(snapshot: InvestigationContextSnapshot): InvestigationContext {
    const ctx = new InvestigationContext();
    ctx.timeWindow = {
      description: snapshot.timeWindow.description,
      start: snapshot.timeWindow.start ? new Date(snapshot.timeWindow.start) : null,
      end: snapshot.timeWindow.end ? new Date(snapshot.timeWindow.end) : null,
      extracted: snapshot.timeWindow.extracted,
    };
    ctx.entities = new Map(Object.entries(snapshot.entities));
    ctx.identifiers = {
      serviceNames: new Set(snapshot.identifiers.serviceNames),
      errorMessages: new Set(snapshot.identifiers.errorMessages),
      transactionNames: new Set(snapshot.identifiers.transactionNames),
      hostnames: new Set(snapshot.identifiers.hostnames),
      regions: new Set(snapshot.identifiers.regions),
    };
    ctx.resources = snapshot.resources || [];
    ctx.scopedGroupName = snapshot.scopedGroupName;

    return ctx;
  }

  /**
   * Parse all user messages in order, only updating the time window
   * when an explicit time hint is found. This preserves the most recent
   * explicit time window across a multi-turn conversation.
   */
  parseAllUserMessages(messages: Array<{ role: string; content: string }>): void {
    for (const msg of messages) {
      if (msg.role !== 'user') continue;

      // Temporarily parse to check if an explicit time hint exists
      const probe = new InvestigationContext();
      probe.parseUserMessage(msg.content);

      if (probe.timeWindow.extracted) {
        // This message has an explicit time hint — adopt it
        this.timeWindow = probe.timeWindow;
      }
      // If no explicit hint, keep the existing time window unchanged
    }
  }

  /**
   * Scope the context to only the given resource names.
   * Filters resources, entities, and service name identifiers to the scoped set.
   */
  scopeToResources(resourceNames: string[], groupName: string): void {
    const nameSet = new Set(resourceNames.map(n => n.toLowerCase()));

    this.resources = this.resources.filter(r => nameSet.has(r.name.toLowerCase()));

    for (const [platform, names] of this.entities) {
      const filtered = names.filter(n => nameSet.has(n.toLowerCase()));
      if (filtered.length > 0) {
        this.entities.set(platform, filtered);
      } else {
        this.entities.delete(platform);
      }
    }

    const filteredServiceNames = new Set<string>();
    for (const name of this.identifiers.serviceNames) {
      if (nameSet.has(name.toLowerCase())) {
        filteredServiceNames.add(name);
      }
    }
    this.identifiers.serviceNames = filteredServiceNames;

    this.scopedGroupName = groupName;
  }
}
