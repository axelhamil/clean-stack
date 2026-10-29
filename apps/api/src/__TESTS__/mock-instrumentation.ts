import { mockPort, type PortMock } from "@packages/test/bun";
import type { IInstrumentation } from "../shared/ports/instrumentation.port";

export function mockInstrumentation(): PortMock<IInstrumentation> {
  const instrumentation = mockPort<IInstrumentation>();
  instrumentation.startSpan.mockImplementation((_options, work) => work());

  return instrumentation;
}
