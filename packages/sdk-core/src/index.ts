/**
 * @novelproctor/sdk-core – public surface
 *
 * Re-exports every type and class that consumers (sdk-react, dashboard, etc.)
 * need to interact with the SDK.  Internal implementation files are NOT
 * re-exported here to keep the public API surface minimal.
 */

export { Autoproctor } from './monitor';
export type { AutoproctorConfig, AutoproctorEvent } from './monitor';
export { WebSocketClient } from './websocketClient';
export { EventEmitter } from './eventEmitter';
