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
          onMessageRef.current?.(message);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
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
