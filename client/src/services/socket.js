function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (typeof location === 'undefined') return 'ws://localhost:8080';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/' 
    ? import.meta.env.BASE_URL.replace(/\/$/, '') 
    : '';
  return `${proto}//${location.host}${basePath}`;
}

const WS_URL = getWsUrl();

class SocketService {
  constructor() {
    this.ws = null;
    this._handlers = {};
    this._reconnectTimer = null;
    /** @type {(() => void)|null} Called when reconnect succeeds — use to rejoin room */
    this.onReconnect = null;
    this._intentionalClose = false;
  }

  connect() {
    // Don't double-connect
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

    this._intentionalClose = false;
    this.ws = new WebSocket(getWsUrl());

    this.ws.onopen = () => {
      clearTimeout(this._reconnectTimer);
      console.log('[HeartPeario] Connected to', getWsUrl());
      if (this.onReconnect) this.onReconnect();
    };

    this.ws.onmessage = ({ data }) => {
      try {
        const { type, payload } = JSON.parse(data);
        (this._handlers[type] || []).forEach(fn => fn(payload));
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      if (!this._intentionalClose) {
        console.log('[HeartPeario] Disconnected — retrying in 2s');
        this._reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = () => this.ws?.close();
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }

  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this._reconnectTimer);
    this.onReconnect = null;
    this.ws?.close();
  }
}

export default new SocketService();
