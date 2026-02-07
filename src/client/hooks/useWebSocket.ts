import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClientMessage, ServerMessage } from '../../server/types.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface UseWebSocketOptions {
  /** URL to connect to. Defaults to auto-detect based on current location. */
  url?: string;
  /** Session token for resuming a previous session. */
  sessionToken?: string | null;
  /** Called when a message is received from the server. */
  onMessage?: (message: ServerMessage) => void;
  /** Called when the connection status changes. */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Whether the hook should connect. Set to false to delay connection. */
  enabled?: boolean;
}

const MAX_RECONNECT_DELAY = 10_000;
const INITIAL_RECONNECT_DELAY = 500;
/** How often the client sends an application-level ping (ms). */
const PING_INTERVAL = 25_000;
/** How long to wait for a pong before considering the connection dead (ms). */
const PONG_TIMEOUT = 10_000;

function getDefaultUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url,
    sessionToken,
    onMessage,
    onStatusChange,
    enabled = true,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest values in refs to avoid reconnection on changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken;

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    updateStatus('disconnected');
  }, [updateStatus]);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    intentionalCloseRef.current = false;

    function stopHeartbeat() {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (pongTimeoutRef.current) {
        clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = null;
      }
    }

    function startHeartbeat(ws: WebSocket) {
      stopHeartbeat();
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        // Send application-level ping
        ws.send(JSON.stringify({ type: 'ping' }));
        // Start pong timeout — if no pong arrives, force-close
        pongTimeoutRef.current = setTimeout(() => {
          pongTimeoutRef.current = null;
          // Connection is zombie — force close to trigger reconnection
          ws.close();
        }, PONG_TIMEOUT);
      }, PING_INTERVAL);
    }

    function connect(isReconnect: boolean) {
      if (!mounted || intentionalCloseRef.current) return;

      const wsUrl = url ?? getDefaultUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      updateStatus(isReconnect ? 'reconnecting' : 'connecting');

      ws.onopen = () => {
        if (!mounted) { ws.close(); return; }
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        updateStatus('connected');
        startHeartbeat(ws);

        // Resume session if we have a token (read from ref to get latest value)
        const token = sessionTokenRef.current;
        if (token) {
          send({ type: 'resume-session', sessionToken: token });
        }
      };

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const message = JSON.parse(event.data as string) as ServerMessage;
          // Application-level pong: clear the pong timeout
          if (message.type === 'pong') {
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
              pongTimeoutRef.current = null;
            }
            return;
          }
          onMessageRef.current?.(message);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        stopHeartbeat();
        if (!mounted || intentionalCloseRef.current) return;
        updateStatus('disconnected');
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which handles reconnection
      };
    }

    function scheduleReconnect() {
      if (!mounted || intentionalCloseRef.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect(true);
      }, delay);
    }

    connect(false);

    return () => {
      mounted = false;
      intentionalCloseRef.current = true;
      stopHeartbeat();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
    // sessionToken is intentionally NOT in deps — read from ref to avoid reconnection cycle
  }, [url, enabled, send, updateStatus]);

  return { status, send, disconnect };
}
