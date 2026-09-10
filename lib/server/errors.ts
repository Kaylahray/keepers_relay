/** Shared API error with HTTP status — replaces store.StoreError. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** @deprecated Use ApiError — kept as alias while routes migrate. */
export const StoreError = ApiError;
