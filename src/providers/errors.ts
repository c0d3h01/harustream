export class ProviderError extends Error {
  public status: number;
  public code?: string;
  public upstream?: string;

  constructor(status: number, message: string, code?: string, upstream?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.upstream = upstream;
  }
}
