<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">
      <div class="mb-6">
        <h1 class="text-lg font-semibold mb-2">Settings</h1>
        <p class="text-xs text-black/50 dark:text-white/50">Manage your workspace and configure integrations</p>
      </div>

      <!-- Tabs -->
      <div class="flex gap-0 border-b border-gray-300 dark:border-gray-700 mb-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="setTab(tab.id)"
          class="px-4 py-2 text-xs font-medium transition-colors -mb-px"
          :class="activeTab === tab.id
            ? 'border-b-2 border-black dark:border-white text-black dark:text-white'
            : 'text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Account Tab -->
      <div v-if="activeTab === 'account'">
        <WorkspaceSettings />
      </div>

      <!-- Integrations Tab -->
      <div v-if="activeTab === 'integrations'">
        <!-- Integration Status -->
        <div class="mb-8 border border-gray-300 dark:border-gray-700 p-5">
          <h2 class="text-xs font-semibold mb-4 uppercase tracking-wide">Status</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div
              v-for="(status, integration) in integrationStatus"
              :key="integration"
              class="flex items-center space-x-2"
            >
              <div
                :class="[
                  'w-2 h-2',
                  status ? 'bg-black dark:bg-white' : 'bg-black/20 dark:bg-white/20',
                ]"
              />
              <Icon
                :icon="integrationIcons[integration as keyof typeof integrationIcons]"
                class="w-4 h-4 shrink-0"
                :class="status ? '' : 'text-black/20 dark:text-white/20'"
              />
              <span class="capitalize text-sm" :class="status ? '' : 'text-black/20 dark:text-white/20'">{{ integration }}</span>
            </div>
          </div>
        </div>

        <!-- Each integration is its own form -->
        <div class="space-y-6">
          <!-- OpenAI (single instance, not indexed) -->
          <SettingSection
            title="OpenAI"
            description="Required for AI agent functionality"
            :connected="integrationStatus.openai"
            :saving="savingSection === 'openai'"
            :status="sectionStatus.openai"
            :status-error="sectionError.openai"
            @save="saveSection('openai', ['openai.api_key'])"
          >
            <SettingInput
              v-model="formData['openai.api_key']"
              label="API Key"
              type="password"
              placeholder="sk-..."
            />
          </SettingSection>

          <!-- New Relic (multi-instance) -->
          <SettingSection
            title="New Relic"
            description="APM monitoring - automatically discovers and monitors ALL applications in your account"
            :connected="integrationStatus.newrelic"
            :saving="savingSection === 'newrelic'"
            :status="sectionStatus.newrelic"
            :status-error="sectionError.newrelic"
            @save="saveIntegration('newrelic', ['api_key', 'account_id', 'region'])"
          >
            <div
              v-for="(idx, pos) in instanceIndices('newrelic')"
              :key="idx"
              :class="pos > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-800' : ''"
            >
              <div v-if="instanceIndices('newrelic').length > 1" class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-black/50 dark:text-white/50">Account {{ pos + 1 }}</span>
                <button
                  type="button"
                  @click="removeInstance('newrelic', idx)"
                  class="text-xs text-red-600 dark:text-red-400 hover:underline"
                >Remove</button>
              </div>
              <div class="space-y-3">
                <SettingInput
                  :model-value="formData[`newrelic.${idx}.api_key`]"
                  @update:model-value="formData[`newrelic.${idx}.api_key`] = $event"
                  label="API Key"
                  type="password"
                  placeholder="NRAK-..."
                />
                <SettingInput
                  :model-value="formData[`newrelic.${idx}.account_id`]"
                  @update:model-value="formData[`newrelic.${idx}.account_id`] = $event"
                  label="Account ID"
                  type="text"
                  placeholder="1234567"
                />
                <div>
                  <label class="block text-xs font-medium mb-1.5">Region</label>
                  <select
                    :value="formData[`newrelic.${idx}.region`] || 'us'"
                    @change="formData[`newrelic.${idx}.region`] = ($event.target as HTMLSelectElement).value"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 focus:outline-none text-sm bg-transparent"
                  >
                    <option value="us">US</option>
                    <option value="eu">EU</option>
                  </select>
                </div>
              </div>
            </div>
            <button
              type="button"
              @click="addInstance('newrelic')"
              class="mt-3 text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >+ Add account</button>
          </SettingSection>

          <!-- Sentry (multi-instance) -->
          <SettingSection
            title="Sentry"
            description="Error tracking - automatically discovers and monitors ALL projects in your organization"
            :connected="integrationStatus.sentry"
            :saving="savingSection === 'sentry'"
            :status="sectionStatus.sentry"
            :status-error="sectionError.sentry"
            @save="saveIntegration('sentry', ['auth_token', 'org'])"
          >
            <div
              v-for="(idx, pos) in instanceIndices('sentry')"
              :key="idx"
              :class="pos > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-800' : ''"
            >
              <div v-if="instanceIndices('sentry').length > 1" class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-black/50 dark:text-white/50">Organization {{ pos + 1 }}</span>
                <button
                  type="button"
                  @click="removeInstance('sentry', idx)"
                  class="text-xs text-red-600 dark:text-red-400 hover:underline"
                >Remove</button>
              </div>
              <div class="space-y-3">
                <SettingInput
                  :model-value="formData[`sentry.${idx}.auth_token`]"
                  @update:model-value="formData[`sentry.${idx}.auth_token`] = $event"
                  label="Auth Token"
                  type="password"
                  placeholder="sntrys_..."
                />
                <SettingInput
                  :model-value="formData[`sentry.${idx}.org`]"
                  @update:model-value="formData[`sentry.${idx}.org`] = $event"
                  label="Organization Slug"
                  type="text"
                  placeholder="my-org"
                />
              </div>
            </div>
            <button
              type="button"
              @click="addInstance('sentry')"
              class="mt-3 text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >+ Add organization</button>
          </SettingSection>

          <!-- AWS (multi-instance) -->
          <SettingSection
            title="AWS"
            description="Cloud infrastructure monitoring"
            :connected="integrationStatus.aws"
            :saving="savingSection === 'aws'"
            :status="sectionStatus.aws"
            :status-error="sectionError.aws"
            @save="saveIntegration('aws', ['access_key_id', 'secret_access_key', 'region'])"
          >
            <div
              v-for="(idx, pos) in instanceIndices('aws')"
              :key="idx"
              :class="pos > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-800' : ''"
            >
              <div v-if="instanceIndices('aws').length > 1" class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-black/50 dark:text-white/50">Account {{ pos + 1 }}</span>
                <button
                  type="button"
                  @click="removeInstance('aws', idx)"
                  class="text-xs text-red-600 dark:text-red-400 hover:underline"
                >Remove</button>
              </div>
              <div class="space-y-3">
                <SettingInput
                  :model-value="formData[`aws.${idx}.access_key_id`]"
                  @update:model-value="formData[`aws.${idx}.access_key_id`] = $event"
                  label="Access Key ID"
                  type="password"
                  placeholder="AKIA..."
                />
                <SettingInput
                  :model-value="formData[`aws.${idx}.secret_access_key`]"
                  @update:model-value="formData[`aws.${idx}.secret_access_key`] = $event"
                  label="Secret Access Key"
                  type="password"
                  placeholder="..."
                />
                <SettingInput
                  :model-value="formData[`aws.${idx}.region`]"
                  @update:model-value="formData[`aws.${idx}.region`] = $event"
                  label="Default Region (optional)"
                  type="text"
                  placeholder="Auto-discovers all regions"
                />
              </div>
            </div>
            <button
              type="button"
              @click="addInstance('aws')"
              class="mt-3 text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >+ Add account</button>
          </SettingSection>

          <!-- PagerDuty (multi-instance) -->
          <SettingSection
            title="PagerDuty"
            description="Incident management — active incidents, on-call schedules, escalation policies"
            :connected="integrationStatus.pagerduty"
            :saving="savingSection === 'pagerduty'"
            :status="sectionStatus.pagerduty"
            :status-error="sectionError.pagerduty"
            @save="saveIntegration('pagerduty', ['api_key'])"
          >
            <div
              v-for="(idx, pos) in instanceIndices('pagerduty')"
              :key="idx"
              :class="pos > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-800' : ''"
            >
              <div v-if="instanceIndices('pagerduty').length > 1" class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-black/50 dark:text-white/50">Account {{ pos + 1 }}</span>
                <button
                  type="button"
                  @click="removeInstance('pagerduty', idx)"
                  class="text-xs text-red-600 dark:text-red-400 hover:underline"
                >Remove</button>
              </div>
              <div class="space-y-3">
                <SettingInput
                  :model-value="formData[`pagerduty.${idx}.api_key`]"
                  @update:model-value="formData[`pagerduty.${idx}.api_key`] = $event"
                  label="User API Token"
                  type="password"
                  placeholder="u+..."
                />
              </div>
            </div>
            <p class="text-xs text-black/50 dark:text-white/50 mt-2">
              Generate at PagerDuty → My Profile → User Settings → API Access. Uses PagerDuty's hosted MCP service.
            </p>
            <button
              type="button"
              @click="addInstance('pagerduty')"
              class="mt-3 text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >+ Add account</button>
          </SettingSection>

          <!-- GitHub (multi-instance) -->
          <SettingSection
            title="GitHub"
            description="Codebase analysis and code-level debugging"
            :connected="integrationStatus.github"
            :saving="savingSection === 'github'"
            :status="sectionStatus.github"
            :status-error="sectionError.github"
            @save="saveIntegration('github', ['token', 'owner', 'repo'])"
          >
            <div
              v-for="(idx, pos) in instanceIndices('github')"
              :key="idx"
              :class="pos > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-800' : ''"
            >
              <div v-if="instanceIndices('github').length > 1" class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-black/50 dark:text-white/50">Repository {{ pos + 1 }}</span>
                <button
                  type="button"
                  @click="removeInstance('github', idx)"
                  class="text-xs text-red-600 dark:text-red-400 hover:underline"
                >Remove</button>
              </div>
              <div class="space-y-3">
                <SettingInput
                  :model-value="formData[`github.${idx}.token`]"
                  @update:model-value="formData[`github.${idx}.token`] = $event"
                  label="Personal Access Token"
                  type="password"
                  placeholder="ghp_..."
                />
                <SettingInput
                  :model-value="formData[`github.${idx}.owner`]"
                  @update:model-value="formData[`github.${idx}.owner`] = $event"
                  label="Repository Owner"
                  type="text"
                  placeholder="mycompany"
                />
                <SettingInput
                  :model-value="formData[`github.${idx}.repo`]"
                  @update:model-value="formData[`github.${idx}.repo`] = $event"
                  label="Repository Name"
                  type="text"
                  placeholder="myapp"
                />
              </div>
            </div>
            <button
              type="button"
              @click="addInstance('github')"
              class="mt-3 text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >+ Add repository</button>
          </SettingSection>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { Icon } from '@iconify/vue';
import SettingSection from './SettingSection.vue';
import SettingInput from './SettingInput.vue';
import WorkspaceSettings from './WorkspaceSettings.vue';
import type { Settings } from '../types';

const integrationIcons: Record<string, string> = {
  openai: 'simple-icons:openai',
  newrelic: 'simple-icons:newrelic',
  sentry: 'simple-icons:sentry',
  aws: 'simple-icons:amazonaws',
  github: 'simple-icons:github',
  pagerduty: 'simple-icons:pagerduty',
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const tabs = [
  { id: 'account', label: 'Account' },
  { id: 'integrations', label: 'Integrations' },
] as const;

type TabId = (typeof tabs)[number]['id'];
const validTabs: readonly string[] = tabs.map((t) => t.id);

const activeTab = computed<TabId>(() => {
  const param = route.params.tab as string | undefined;
  return param && validTabs.includes(param) ? (param as TabId) : 'account';
});

function setTab(id: TabId) {
  router.replace(id === 'account' ? '/settings' : `/settings/${id}`);
}

const formData = ref<Partial<Settings>>({});
const savingSection = ref<string | null>(null);
const sectionStatus = reactive<Record<string, string>>({});
const sectionError = reactive<Record<string, boolean>>({});

const integrationStatus = computed(() => settingsStore.integrationStatus);

// Wait for currentAccount before fetching settings (handles page refresh)
watch(
  () => authStore.currentAccount?.id,
  async (id) => {
    if (id) {
      await settingsStore.fetchSettings();
      await settingsStore.fetchIntegrationStatus();
      formData.value = { ...settingsStore.settings };
    }
  },
  { immediate: true },
);

/**
 * Get sorted instance indices for an integration from formData keys.
 * Always returns at least [0] so there's always one empty form.
 */
function instanceIndices(integration: string): number[] {
  const pattern = new RegExp(`^${integration}\\.(\\d+)\\.`);
  const indices = new Set<number>();
  for (const key of Object.keys(formData.value)) {
    const match = key.match(pattern);
    if (match) indices.add(parseInt(match[1]));
  }
  if (indices.size === 0) return [0];
  return [...indices].sort((a, b) => a - b);
}

/**
 * Add a new empty instance for an integration.
 */
function addInstance(integration: string) {
  const indices = instanceIndices(integration);
  const next = indices.length > 0 ? Math.max(...indices) + 1 : 0;
  // Set a placeholder key so the instance shows up
  formData.value[`${integration}.${next}.`] = '';
  // Trigger reactivity
  formData.value = { ...formData.value };
}

/**
 * Remove an integration instance. If saved, calls backend to delete and reindex.
 */
async function removeInstance(integration: string, index: number) {
  // Remove from formData
  const prefix = `${integration}.${index}.`;
  const keysToRemove = Object.keys(formData.value).filter(k => k.startsWith(prefix));
  for (const key of keysToRemove) {
    delete formData.value[key];
  }

  // Reindex higher instances in formData
  const higherPattern = new RegExp(`^${integration}\\.(\\d+)\\.(.+)$`);
  const updates: { oldKey: string; newKey: string }[] = [];
  for (const key of Object.keys(formData.value)) {
    const match = key.match(higherPattern);
    if (!match) continue;
    const oldIdx = parseInt(match[1]);
    if (oldIdx > index) {
      updates.push({ oldKey: key, newKey: `${integration}.${oldIdx - 1}.${match[2]}` });
    }
  }
  for (const { oldKey, newKey } of updates) {
    formData.value[newKey] = formData.value[oldKey];
    delete formData.value[oldKey];
  }

  formData.value = { ...formData.value };

  // Delete on the backend
  await settingsStore.deleteIntegrationInstance(integration, index);
  formData.value = { ...settingsStore.settings };
}

/**
 * Save only the keys belonging to a single integration section (non-indexed, e.g. openai).
 */
async function saveSection(section: string, keys: string[]) {
  savingSection.value = section;
  sectionStatus[section] = '';
  sectionError[section] = false;

  const payload: Partial<Settings> = {};
  for (const key of keys) {
    const val = formData.value[key];
    if (val !== undefined && val !== null && val !== '') {
      payload[key] = val;
    }
  }

  const success = await settingsStore.updateSettings(payload);
  showStatus(section, success);
}

/**
 * Save all instances of a multi-instance integration.
 * Collects all integration.N.field keys from formData.
 */
async function saveIntegration(integration: string, fields: string[]) {
  savingSection.value = integration;
  sectionStatus[integration] = '';
  sectionError[integration] = false;

  const payload: Partial<Settings> = {};
  for (const idx of instanceIndices(integration)) {
    for (const field of fields) {
      const key = `${integration}.${idx}.${field}`;
      const val = formData.value[key];
      if (val !== undefined && val !== null && val !== '') {
        payload[key] = val;
      }
    }
  }

  const success = await settingsStore.updateSettings(payload);
  showStatus(integration, success);
}

function showStatus(section: string, success: boolean) {
  if (success) {
    sectionStatus[section] = 'Saved';
    sectionError[section] = false;
  } else {
    sectionStatus[section] = settingsStore.error || 'Failed to save';
    sectionError[section] = true;
  }

  savingSection.value = null;

  setTimeout(() => {
    sectionStatus[section] = '';
    sectionError[section] = false;
  }, 3000);
}
</script>
