// src/websocketClient.ts
/**
 * Simple resilient WebSocket client for sending binary blobs to the gateway.
 * Handles reconnection with exponential back‑off, message size limits,
 * and allows registration of message and error handlers.
 */
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxMessageSize = 2 * 1024 * 1024; // 2 MiB
  private readonly maxBackoff = 30000; // 30 s
  private messageHandler: ((msg: any) => void) | null = null;
  private errorHandler: ((err: any) => void) | null = null;

  constructor(gatewayUrl: string) {
    // The server expects the stream endpoint at `${gatewayUrl}/stream`
    this.url = `${gatewayUrl.replace(/\/+$/, '')}/stream`;
    // Connection is established explicitly via connect()
  }

  /**
   * Establish the WebSocket connection.
   * Returns a promise that resolves when the socket is open.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('[WebSocketClient] Connected');
        resolve();
      };
      this.ws.onclose = () => {
        console.warn('[WebSocketClient] Connection closed, attempting reconnect');
        this.scheduleReconnect();
      };
      this.ws.onerror = (e) => {
        console.error('[WebSocketClient] Error', e);
        this.errorHandler?.(e);
        this.ws?.close();
        reject(e);
      };
      this.ws.onmessage = (event) => {
        this.messageHandler?.(event.data);
      };
    });
  }

  /** Register a handler for incoming messages. */
  onMessage(handler: (msg: any) => void): void {
    this.messageHandler = handler;
  }

  /** Register a handler for socket errors. */
  onError(handler: (err: any) => void): void {
    this.errorHandler = handler;
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const backoff = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxBackoff);
    setTimeout(() => this.connect(), backoff);
  }

  /** Send a Blob (binary) to the server */
  async sendBlob(blob: Blob): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    const arrayBuffer = await blob.arrayBuffer();
    if (arrayBuffer.byteLength > this.maxMessageSize) {
      throw new Error('Message exceeds 2 MiB size limit');
    }
    this.ws.send(arrayBuffer);
  }

  /** Close the connection gracefully */
  close() {
    this.ws?.close();
    this.ws = null;
  }
}
