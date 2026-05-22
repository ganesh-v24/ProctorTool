import { EventEmitter } from './eventEmitter';
import { WebSocketClient } from "./websocketClient";

/**
 * Types of events emitted by Autoproctor.
 */
export type AutoproctorEvent =
  | 'violation'
  | 'face-update'
  | 'risk-update'
  | 'audio-level'
  | 'tab-switch';

/**
 * Configuration for the Autoproctor instance.
 */
export interface AutoproctorConfig {
  /** API key – should be provided via environment, never hard‑coded */
  apiKey?: string;
  /** Candidate identifier */
  candidateId: string;
  /** Session identifier */
  sessionId: string;
  /** Gateway URL (WebSocket endpoint will be `${gatewayUrl}/stream`) */
  gatewayUrl: string;
}

/**
 * Core monitoring class. It encapsulates webcam, audio, fullscreen and tab
 * visibility detection and forwards relevant information through an internal
 * {@link EventEmitter}. Consumers obtain an instance of this class via the SDK
 * and subscribe to events with `on(event, handler)`.
 */
export class Autoproctor {
  private emitter = new EventEmitter();
  private videoStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioDataArray: Uint8Array | null = null;
  private wsClient: WebSocketClient;
  private audioThresholdCooldown = false;
  private config: AutoproctorConfig;

  constructor(config: AutoproctorConfig) {
    // Defensive copy – never store secrets in plain text beyond the lifetime of the instance.
    this.config = { ...config };
    // Initialize WebSocket client
    this.wsClient = new WebSocketClient(this.config.gatewayUrl);
    // Bind event handlers that rely on `this`.
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);
    this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
  }

  /** Subscribe to events emitted by the monitor. */
  on(event: AutoproctorEvent, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  /** Unsubscribe a previously registered listener. */
  off(event: AutoproctorEvent, listener: (...args: any[]) => void) {
    this.emitter.off(event, listener);
  }

  /** Start the monitoring workflow. */
  async start(): Promise<void> {
    await this.initVideo();
    await this.initAudio();
    this.registerVisibilityHandlers();
    this.registerFullscreenHandler();
    // Connect to gateway WebSocket
    await this.wsClient.connect();
    // Emit an initial ready event for consumers.
    this.emitter.emit('risk-update', { trustScore: 100 });
  }

  /** Stop all monitoring and release resources. */
  async stop(): Promise<void> {
    this.unregisterVisibilityHandlers();
    this.unregisterFullscreenHandler();
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
      this.audioAnalyser = null;
      this.audioDataArray = null;
    }
    // Close WebSocket connection
    this.wsClient.close();
  }

  /** Initialize webcam video stream (no UI rendering here). */
  private async initVideo(): Promise<void> {
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      // Emit a placeholder event – SDK consumers can attach the stream to a video element.
      this.emitter.emit('face-update', { stream: this.videoStream });
    } catch (err) {
      // Emit a violation event; callers can decide how to handle it.
      this.emitter.emit('violation', { type: 'NO_VIDEO', error: err });
    }
  }

  /** Initialize audio analysis for noise detection. */
  private async initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      this.audioAnalyser = analyser;
      this.audioDataArray = new Uint8Array(analyser.frequencyBinCount);
      this.monitorAudioLevel();
    } catch (err) {
      this.emitter.emit('violation', { type: 'NO_AUDIO', error: err });
    }
  }

  /** Continuous audio level monitoring – emits 'audio-level' events. */
  private monitorAudioLevel(): void {
    if (!this.audioAnalyser || !this.audioDataArray) return;
    const check = () => {
      if (!this.audioAnalyser) return;
      // Create a fresh Uint8Array matching the analyser's frequency bin count
      const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      this.audioAnalyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / dataArray.length;
      this.emitter.emit('audio-level', { average });
      if (average > 35 && !this.audioThresholdCooldown) {
        this.audioThresholdCooldown = true;
        this.emitter.emit('violation', { type: 'NOISE', level: average });
        setTimeout(() => (this.audioThresholdCooldown = false), 3000);
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  /** Visibility and focus handlers – report tab switches. */
  private handleVisibilityChange() {
    if (document.hidden) {
      this.emitter.emit('violation', { type: 'TAB_SWITCHED', reason: 'visibilitychange' });
    }
    // Notify gateway of tab switch
    this.wsClient.sendBlob(new Blob([JSON.stringify({ event: 'tab-switch', hidden: document.hidden })], { type: 'application/json' }));
  }

  private handleWindowBlur() {
    this.emitter.emit('violation', { type: 'TAB_SWITCHED', reason: 'window blur' });
    // Notify gateway of blur event
    this.wsClient.sendBlob(new Blob([JSON.stringify({ event: 'window-blur' })], { type: 'application/json' }));
  }

  private registerVisibilityHandlers() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private unregisterVisibilityHandlers() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleWindowBlur);
  }

  /** Fullscreen change detection – useful for monitoring attempts to hide UI. */
  private handleFullscreenChange() {
    if (!document.fullscreenElement) {
      this.emitter.emit('violation', { type: 'FULLSCREEN_EXIT' });
    }
  }

  private registerFullscreenHandler() {
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  private unregisterFullscreenHandler() {
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
  }
}
