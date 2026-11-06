import type { IInstrumentation } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "./port-mock";

export function mockInstrumentation(): PortMock<IInstrumentation> {
  const instrumentation = mockPort<IInstrumentation>();
  instrumentation.startSpan.mockImplementation((_options, work) => work());

  return instrumentation;
}
