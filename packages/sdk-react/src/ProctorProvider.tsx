import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Autoproctor, AutoproctorConfig } from '@novelproctor/sdk-core';

// Define the shape of the context value
export interface ProctorContextValue {
  proctor: Autoproctor | null;
  ready: boolean;
}

const ProctorContext = createContext<ProctorContextValue | undefined>(undefined);

/**
 * ProctorProvider component – bootstraps the NovelProctor SDK and makes it available
 * via React context to descendant components.
 *
 * Security considerations:
 *  - No secrets are stored in global scope; the apiKey (if provided) is kept only in the
 *    instance configuration and never logged.
 *  - All communication passes through the secure WebSocket client defined in sdk-core,
 *    which enforces size limits and binary encoding.
 *  - The provider does not expose any mutable globals; consumers interact via the
 *    context which only provides read‑only access to the SDK instance.
 */
export const ProctorProvider = ({
  children,
  options,
}: {
  children: ReactNode;
  options: AutoproctorConfig;
}): JSX.Element => {
  const [proctor, setProctor] = useState<Autoproctor | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Instantiate the SDK. Defensive copy of options to avoid accidental mutation.
    const sdk = new Autoproctor({ ...options });
    setProctor(sdk);

    // Start the monitor and WebSocket connection.
    sdk.start().then(() => setReady(true)).catch((err) => {
      // Emit a violation via the SDK's internal emitter – callers can listen on the SDK
      // instance directly if they need to handle errors.
      console.error('ProctorProvider failed to start:', err);
    });

    return () => {
      // Cleanup on unmount – stop the SDK gracefully.
      sdk.stop().catch((err) => console.error('Error stopping Proctor SDK:', err));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps – we want this to run once.
  }, []);

  return (
    <ProctorContext.Provider value={{ proctor, ready }}>
      {children}
    </ProctorContext.Provider>
  );
};

/**
 * Hook to access the Proctor SDK instance from any functional component.
 * Throws an error if used outside of a ProctorProvider.
 */
export const useProctor = (): ProctorContextValue => {
  const ctx = useContext(ProctorContext);
  if (!ctx) {
    throw new Error('useProctor must be used within a ProctorProvider');
  }
  return ctx;
};
