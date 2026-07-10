// Server-side error helpers.
//
// Rule: user-facing error messages must never contain database errors, stack
// traces, upstream provider bodies, or file paths. Log the full detail with
// `console.error` (surfaces in Server Logs with the raw Error and its stack)
// and throw a short generic message that's safe to render in a toast.

export function logAndThrow(publicMessage: string, internal: unknown): never {
  // Preserve the raw Error so `.stack` survives in server logs.
  console.error(`[server] ${publicMessage}:`, internal);
  throw new Error(publicMessage);
}

// Common canned messages — keep them short, human, and free of internals.
export const PublicMessages = {
  loadFailed: "Couldn't load your data. Please try again.",
  saveFailed: "Couldn't save your changes. Please try again.",
  deleteFailed: "Couldn't delete this item. Please try again.",
  uploadFailed: "Upload failed. Please try again.",
  analysisFailed: "Analysis failed. Please try again.",
  notFound: "Not found.",
  imageUnavailable: "Couldn't load the image.",
  serviceUnavailable: "Service temporarily unavailable. Please try again shortly.",
  serverMisconfigured: "The server isn't configured correctly. Please contact support.",
} as const;
