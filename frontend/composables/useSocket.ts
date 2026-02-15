import { ref } from "vue";
import { createConsumer, type Consumer } from "@rails/actioncable";

const TOKEN_KEY = "faultline:token";

// Module-level singleton — shared across all components
let consumer: Consumer | null = null;
const connected = ref(false);

export function useSocket() {
  /**
   * Create and connect the global ActionCable consumer (idempotent).
   */
  function connect(token: string) {
    if (consumer) return;

    const baseUrl = import.meta.env.VITE_WS_URL || "";
    const cableUrl = `${baseUrl}/cable?token=${encodeURIComponent(token)}`;

    consumer = createConsumer(cableUrl);
    connected.value = true;
  }

  /**
   * Tear down the global consumer.
   */
  function disconnect() {
    if (consumer) {
      consumer.disconnect();
      consumer = null;
      connected.value = false;
    }
  }

  /**
   * Get the raw consumer instance (for subscription management).
   */
  function getConsumer(): Consumer | null {
    return consumer;
  }

  return {
    connected,
    connect,
    disconnect,
    getConsumer,
  };
}
