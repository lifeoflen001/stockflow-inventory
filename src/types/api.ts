export type EntityId<T extends string = string> = string & { readonly __entity?: T };

export type QueryParams = Record<string, string | number | boolean | undefined>;
export type RequestBody = Record<string, unknown>;

export interface ApiEndpoint<TResult = unknown, TInput = QueryParams> {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly empty: TResult;
  readonly input?: TInput;
}

export interface ApiErrorBody {
  message?: string;
  errors?: Record<string, string[]>;
}
