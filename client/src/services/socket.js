function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (typeof location === 'undefined') return 'ws://localhost:8181/ws';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';

  // In local dev mode or production proxy, connect directly to same host on /ws
  const basePath = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/' 
    ? import.meta.env.BASE_URL.replace(/\/$/, '') 
    : '';
  return `${proto}//${location.host}${basePath}/ws`;
}

class SocketService {
  constructor() {
    this.ws = null;
    this._handlers = {};
    this._sendQueue = [];
    this._reconnectTimer = null;
    /** @type {(() => void)|null} Called when reconnect succeeds — use to rejoin room */
    this.onReconnect = null;
    this._intentionalClose = false;
  }

  connect() {
    // Don't double-connect if already open or connecting
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this._intentionalClose = false;
    const url = getWsUrl();
    console.log('[HeartPeario] Connecting to WebSocket:', url);

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('[HeartPeario] Failed to construct WebSocket:', err);
      this._reconnectTimer = setTimeout(() => this.connect(), 2000);
      return;
    }

    this.ws.onopen = () => {
      clearTimeout(this._reconnectTimer);
      console.log('[HeartPeario] WebSocket Connected:', url);

      // Flush queued messages
      if (this._sendQueue.length > 0) {
        console.log(`[HeartPeario] Flushing ${this._sendQueue.length} queued messages`);
        while (this._sendQueue.length > 0) {
          const item = this._sendQueue.shift();
          this.ws.send(JSON.stringify(item));
        }
      }

      if (this.onReconnect) this.onReconnect();
    };

    this.ws.onmessage = ({ data }) => {
      try {
        const { type, payload } = JSON.parse(data);
        (this._handlers[type] || []).forEach(fn => fn(payload));
      } catch (err) {
        console.warn('[HeartPeario] Malformed message received:', data);
      }
    };

    this.ws.onclose = () => {
      if (!this._intentionalClose) {
        console.log('[HeartPeario] Disconnected — retrying in 2s');
        this._reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[HeartPeario] WebSocket error:', err);
      this.ws?.close();
    };
  }

  /**
   * Subscribe to a message type.
   * @returns Unsubscribe function
   */
  on(type, fn) {
    if (!this._handlers[type]) this._handlers[type] = [];
    this._handlers[type].push(fn);
    return () => {
      this._handlers[type] = this._handlers[type].filter(f => f !== fn);
    };
  }

  send(type, payload = {}) {
    const item = { type, payload };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(item));
      return true;
    }
    console.log(`[HeartPeario] Socket not ready (state ${this.ws?.readyState}), queueing message:`, type);
    this._sendQueue.push(item);
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    }
    return false;
  }

  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this._reconnectTimer);
    this._sendQueue = [];
    this.onReconnect = null;
    this.ws?.close();
  }
}

export default new SocketService();
