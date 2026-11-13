export interface AuthRequestHandler {
  handle(request: Request): Promise<Response>;
}
