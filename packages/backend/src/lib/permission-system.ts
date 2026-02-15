import { logger } from './utils/logger';

export type PermissionAction = 'allow' | 'deny' | 'ask';

export type PermissionRuleset = Record<string, PermissionAction>;

export interface PermissionRequest {
  permission: string;
  patterns?: string[];
  always?: string[];
  metadata?: Record<string, any>;
}

export interface PermissionResult {
  action: PermissionAction;
  matched: string;
  rule?: string;
}

export class PermissionSystem {
  static evaluate(
    toolName: string,
    context: string,
    ruleset: PermissionRuleset,
  ): PermissionResult {
    const rules = Object.entries(ruleset).sort(([patternA], [patternB]) => {
      const wildcardCountA = (patternA.match(/\*/g) || []).length;
      const wildcardCountB = (patternB.match(/\*/g) || []).length;
      return wildcardCountA - wildcardCountB;
    });

    for (const [pattern, action] of rules) {
      if (this.matchesPattern(toolName, pattern)) {
        logger.debug({ toolName, pattern, action, context }, 'Permission matched');
        return { action, matched: pattern, rule: `${pattern} -> ${action}` };
      }
    }

    logger.warn({ toolName, context }, 'No permission rule matched, defaulting to deny');
    return { action: 'deny', matched: 'default', rule: 'default -> deny' };
  }

  static matchesPattern(toolName: string, pattern: string): boolean {
    if (pattern === toolName) return true;
    if (pattern === '*') return true;

    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___DOUBLE___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE___/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(toolName);
  }

  static evaluateMany(
    toolNames: string[],
    context: string,
    ruleset: PermissionRuleset,
  ): Map<string, PermissionResult> {
    const results = new Map<string, PermissionResult>();
    for (const toolName of toolNames) {
      results.set(toolName, this.evaluate(toolName, context, ruleset));
    }
    return results;
  }

  static filterAllowedTools(
    toolNames: string[],
    ruleset: PermissionRuleset,
  ): { allowed: string[]; askRequired: string[]; denied: string[] } {
    const allowed: string[] = [];
    const askRequired: string[] = [];
    const denied: string[] = [];

    for (const toolName of toolNames) {
      const result = this.evaluate(toolName, 'filtering', ruleset);
      if (result.action === 'allow') allowed.push(toolName);
      else if (result.action === 'ask') askRequired.push(toolName);
      else denied.push(toolName);
    }

    return { allowed, askRequired, denied };
  }

  static combineRulesets(...rulesets: PermissionRuleset[]): PermissionRuleset {
    return Object.assign({}, ...rulesets);
  }

  static createRestrictive(allowed: string[]): PermissionRuleset {
    const ruleset: PermissionRuleset = { '*': 'deny' };
    for (const pattern of allowed) ruleset[pattern] = 'allow';
    return ruleset;
  }

  static createPermissive(denied: string[]): PermissionRuleset {
    const ruleset: PermissionRuleset = { '*': 'allow' };
    for (const pattern of denied) ruleset[pattern] = 'deny';
    return ruleset;
  }

  static validateRuleset(ruleset: PermissionRuleset): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!('*' in ruleset)) errors.push('Ruleset must contain a wildcard "*" default rule');
    for (const pattern of Object.keys(ruleset)) {
      if (pattern.includes('//')) errors.push(`Invalid pattern "${pattern}": contains double slashes`);
    }
    return { valid: errors.length === 0, errors };
  }
}

export enum SpecialPermission {
  DOOM_LOOP = 'doom_loop',
  EXTERNAL_DIRECTORY = 'external_directory',
  DESTRUCTIVE_OPERATION = 'destructive_operation',
  NETWORK_REQUEST = 'network_request',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  BASH_COMMAND = 'bash_command',
}

export const PermissionPresets = {
  FULL_ACCESS: { '*': 'allow' as PermissionAction },
  READ_ONLY: {
    '*': 'deny' as PermissionAction,
    'get_*': 'allow' as PermissionAction,
    'list_*': 'allow' as PermissionAction,
    'search_*': 'allow' as PermissionAction,
    'query_*': 'allow' as PermissionAction,
  },
  SAFE_ONLY: {
    '*': 'allow' as PermissionAction,
    'delete_*': 'deny' as PermissionAction,
    'remove_*': 'deny' as PermissionAction,
    'drop_*': 'deny' as PermissionAction,
    bash: 'ask' as PermissionAction,
    edit: 'ask' as PermissionAction,
  },
  MONITORING: {
    '*': 'deny' as PermissionAction,
    'get_*_metrics': 'allow' as PermissionAction,
    'get_*_errors': 'allow' as PermissionAction,
    'get_*_logs': 'allow' as PermissionAction,
    'query_*': 'allow' as PermissionAction,
    'search_*': 'allow' as PermissionAction,
  },
  ASK_ALL: { '*': 'ask' as PermissionAction },
  DENY_ALL: { '*': 'deny' as PermissionAction },
};
