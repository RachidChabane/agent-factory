import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { CockpitServices } from './services.ts';

const ServicesContext = createContext<CockpitServices | null>(null);
const NowContext = createContext<number>(0);

export const NOW_TICK_MS = 15_000;

export function useServices(): CockpitServices {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices must be used inside CockpitProvider');
  return services;
}

export function useNow(): number {
  return useContext(NowContext);
}

interface CockpitProviderProps {
  readonly services: CockpitServices;
  readonly children: ReactNode;
  readonly tickMs?: number | undefined;
}

export function CockpitProvider({ services, children, tickMs = NOW_TICK_MS }: CockpitProviderProps) {
  const [now, setNow] = useState(() => services.clock.now());
  useEffect(() => {
    services.start();
    return () => services.stop();
  }, [services]);
  useEffect(() => {
    const handle = setInterval(() => setNow(services.clock.now()), tickMs);
    return () => clearInterval(handle);
  }, [services, tickMs]);
  return (
    <ServicesContext.Provider value={services}>
      <NowContext.Provider value={now}>{children}</NowContext.Provider>
    </ServicesContext.Provider>
  );
}
