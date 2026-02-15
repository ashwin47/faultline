import { ref } from "vue";
import { io as ioClient, Socket } from "socket.io-client";

const TOKEN_KEY = "faultline:token";

// Module-level singleton — shared across all components
let socket: Socket | null = null;
const connected = ref(false);

export function useSocket() {
  /**
   * Create and connect the global socket (idempotent).
   */
  function connect(token: string) {
    if (socket?.connected) return;

    // If a disconnected socket exists, clean it up first
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    const socketUrl = import.meta.env.VITE_WS_URL || "";

    socket = ioClient(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      auth: { token },
    });

    socket.on("connect", () => {
      console.log("WebSocket connected");
      connected.value = true;
    });

    socket.on("disconnect", () => {
      console.log("WebSocket disconnected");
      connected.value = false;
    });

    // Sliding renewal: backend sends a fresh token on socket connect
    socket.on("auth:renewed", (data: { token: string }) => {
      localStorage.setItem(TOKEN_KEY, data.token);
      // Update socket auth so reconnections use the fresh token
      if (socket) {
        socket.auth = { token: data.token };
      }
    });

    socket.on("connect_error", (error) => {
      console.error("WebSocket connection error:", error.message);
      connected.value = false;

      if (
        error.message.includes("Authentication") ||
        error.message.includes("token") ||
        error.message.includes("expired")
      ) {
        // Token is invalid/expired — use the latest from localStorage in case
        // an HTTP request already renewed it
        const latest = localStorage.getItem(TOKEN_KEY);
        if (latest && latest !== (socket?.auth as any)?.token) {
          if (socket) {
            socket.auth = { token: latest };
            socket.connect();
          }
        }
      }
    });
  }

  /**
   * Tear down the global socket.
   */
  function disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
      connected.value = false;
    }
  }

  /**
   * Get the raw socket instance (for event binding).
   */
  function getSocket(): Socket | null {
    return socket;
  }

  return {
    connected,
    connect,
    disconnect,
    getSocket,
  };
}
