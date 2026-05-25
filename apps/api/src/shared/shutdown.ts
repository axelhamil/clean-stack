let shuttingDown = false;
let started = false;

export const lifecycleState = {
  signalShutdown: (): void => {
    shuttingDown = true;
  },
  isShuttingDown: (): boolean => shuttingDown,
  markStarted: (): void => {
    started = true;
  },
  isStarted: (): boolean => started,
};
