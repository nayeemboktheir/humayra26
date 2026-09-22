type FunctionError = {
  message?: string;
  context?: { json?: () => Promise<unknown> };
};

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const getFunctionErrorMessage = async (
  error: unknown,
  data: unknown,
  fallback: string,
) => {
  const response = data as { error?: unknown } | null;
  if (typeof response?.error === "string") return response.error;

  try {
    const functionError = error as FunctionError | null;
    if (typeof functionError?.context?.json === "function") {
      const body = await functionError.context.json() as { error?: unknown };
      if (typeof body?.error === "string") return body.error;
    }
  } catch {
    // Fall through when the Edge Function response body is unavailable.
  }

  return (error as FunctionError | null)?.message || fallback;
};

