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
          <!-- OpenAI -->
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

          <!-- New Relic -->
          <SettingSection
            title="New Relic"
            description="APM monitoring - automatically discovers and monitors ALL applications in your account"
            :connected="integrationStatus.newrelic"
            :saving="savingSection === 'newrelic'"
            :status="sectionStatus.newrelic"
            :status-error="sectionError.newrelic"
            @save="saveSection('newrelic', ['newrelic.api_key', 'newrelic.account_id', 'newrelic.region'])"
          >
            <SettingInput
              v-model="formData['newrelic.api_key']"
              label="API Key"
              type="password"
              placeholder="NRAK-..."
            />
            <SettingInput
              v-model="formData['newrelic.account_id']"
              label="Account ID"
              type="text"
              placeholder="1234567"
            />
            <div>
              <label class="block text-xs font-medium mb-1.5">Region</label>
              <select
                :value="formData['newrelic.region'] || 'us'"
                @change="formData['newrelic.region'] = ($event.target as HTMLSelectElement).value"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 focus:outline-none text-sm bg-transparent"
              >
                <option value="us">US</option>
                <option value="eu">EU</option>
              </select>
            </div>
          </SettingSection>

          <!-- Sentry -->
          <SettingSection
            title="Sentry"
            description="Error tracking - automatically discovers and monitors ALL projects in your organization"
            :connected="integrationStatus.sentry"
            :saving="savingSection === 'sentry'"
            :status="sectionStatus.sentry"
            :status-error="sectionError.sentry"
            @save="saveSection('sentry', ['sentry.auth_token', 'sentry.org'])"
          >
            <SettingInput
              v-model="formData['sentry.auth_token']"
              label="Auth Token"
              type="password"
              placeholder="sntrys_..."
            />
            <SettingInput
              v-model="formData['sentry.org']"
              label="Organization Slug"
              type="text"
              placeholder="my-org"
            />
          </SettingSection>

          <!-- AWS -->
          <SettingSection
            title="AWS"
            description="Cloud infrastructure monitoring"
            :connected="integrationStatus.aws"
            :saving="savingSection === 'aws'"
            :status="sectionStatus.aws"
            :status-error="sectionError.aws"
            @save="saveSection('aws', ['aws.access_key_id', 'aws.secret_access_key', 'aws.region'])"
          >
            <SettingInput
              v-model="formData['aws.access_key_id']"
              label="Access Key ID"
              type="password"
              placeholder="AKIA..."
            />
            <SettingInput
              v-model="formData['aws.secret_access_key']"
              label="Secret Access Key"
              type="password"
              placeholder="..."
            />
            <SettingInput
              v-model="formData['aws.region']"
              label="Default Region (optional)"
              type="text"
              placeholder="Auto-discovers all regions"
            />
          </SettingSection>

          <!-- PagerDuty -->
          <SettingSection
            title="PagerDuty"
            description="Incident management — active incidents, on-call schedules, escalation policies"
            :connected="integrationStatus.pagerduty"
            :saving="savingSection === 'pagerduty'"
            :status="sectionStatus.pagerduty"
            :status-error="sectionError.pagerduty"
            @save="saveSection('pagerduty', ['pagerduty.api_key'])"
          >
            <SettingInput
              v-model="formData['pagerduty.api_key']"
              label="User API Token"
              type="password"
              placeholder="u+..."
            />
            <p class="text-xs text-black/50 dark:text-white/50 mt-2">
              Generate at PagerDuty → My Profile → User Settings → API Access. Uses PagerDuty's hosted MCP service.
            </p>
          </SettingSection>

          <!-- GitHub -->
          <SettingSection
            title="GitHub"
            description="Codebase analysis and code-level debugging"
            :connected="integrationStatus.github"
            :saving="savingSection === 'github'"
            :status="sectionStatus.github"
            :status-error="sectionError.github"
            @save="saveSection('github', ['github.token', 'github.owner', 'github.repo'])"
          >
            <SettingInput
              v-model="formData['github.token']"
              label="Personal Access Token"
              type="password"
              placeholder="ghp_..."
            />
            <SettingInput
              v-model="formData['github.owner']"
              label="Repository Owner"
              type="text"
              placeholder="mycompany"
            />
            <SettingInput
              v-model="formData['github.repo']"
              label="Repository Name"
              type="text"
              placeholder="myapp"
            />
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
 * Save only the keys belonging to a single integration section.
 */
async function saveSection(section: string, keys: string[]) {
  savingSection.value = section;
  sectionStatus[section] = '';
  sectionError[section] = false;

  // Build a partial settings object with only this section's keys
  const payload: Partial<Settings> = {};
  for (const key of keys) {
    const val = formData.value[key as keyof Settings];
    if (val !== undefined && val !== null && val !== '') {
      payload[key as keyof Settings] = val;
    }
  }

  const success = await settingsStore.updateSettings(payload);

  if (success) {
    sectionStatus[section] = 'Saved';
    sectionError[section] = false;
  } else {
    sectionStatus[section] = settingsStore.error || 'Failed to save';
    sectionError[section] = true;
  }

  savingSection.value = null;

  // Clear status after a few seconds
  setTimeout(() => {
    sectionStatus[section] = '';
    sectionError[section] = false;
  }, 3000);
}
</script>
