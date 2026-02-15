import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { useAuthStore } from './auth';
import type { Settings, IntegrationStatus } from '../types';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({});
  const integrationStatus = ref<IntegrationStatus>({
    openai: false,
    newrelic: false,
    sentry: false,
    aws: false,
    github: false,
    pagerduty: false,
  });
  const loading = ref(false);
  const error = ref<string | null>(null);

  function accountBase() {
    const authStore = useAuthStore();
    return `/api/accounts/${authStore.currentAccount?.id}`;
  }

  /**
   * Fetch settings from the backend
   */
  async function fetchSettings() {
    loading.value = true;
    error.value = null;

    try {
      const response = await axios.get(`${accountBase()}/settings`);
      settings.value = response.data.settings;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch settings';
      console.error('Error fetching settings:', err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Fetch integration status
   */
  async function fetchIntegrationStatus() {
    try {
      const response = await axios.get(`${accountBase()}/settings/status`);
      integrationStatus.value = response.data.integrations;
    } catch (err: any) {
      console.error('Error fetching integration status:', err);
    }
  }

  /**
   * Update settings
   */
  async function updateSettings(newSettings: Partial<Settings>) {
    loading.value = true;
    error.value = null;

    try {
      await axios.put(`${accountBase()}/settings`, {
        settings: newSettings,
      });

      // Merge new settings into current settings
      settings.value = { ...settings.value, ...newSettings };

      // Refresh integration status
      await fetchIntegrationStatus();

      return true;
    } catch (err: any) {
      error.value = err.message || 'Failed to update settings';
      console.error('Error updating settings:', err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Test integration connection
   */
  async function testIntegration(integration: string) {
    try {
      const response = await axios.post(`${accountBase()}/settings/test/${integration}`);
      return response.data;
    } catch (err: any) {
      console.error(`Error testing ${integration}:`, err);
      return {
        success: false,
        message: err.message || 'Connection test failed',
      };
    }
  }

  return {
    settings,
    integrationStatus,
    loading,
    error,
    fetchSettings,
    fetchIntegrationStatus,
    updateSettings,
    testIntegration,
  };
});
