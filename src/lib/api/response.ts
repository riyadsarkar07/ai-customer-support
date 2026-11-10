import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  LimitError,
} from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";

export type ApiErrorBody = {
  error: { message: string; code?: string; details?: unknown };
};

export function jsonError(
  message: string,
  status = 400,
  code?: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { message, code, details } },
    { status },
  );
}

export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof UnauthorizedError) {
    return jsonError(error.message, 401, "unauthorized");
  }
  if (error instanceof ForbiddenError) {
    return jsonError(error.message, 403, "forbidden");
  }
  if (error instanceof NotFoundError) {
    return jsonError(error.message, 404, "not_found");
  }
  if (error instanceof ValidationError) {
    return jsonError(error.message, 422, "validation_error", error.details);
  }
  if (error instanceof LimitError) {
    return jsonError(error.message, 402, error.code);
  }
  if (error instanceof ZodError) {
    return jsonError("Validation failed", 422, "validation_error", error.flatten());
  }
  logger.error({ err: error }, "Unhandled API error");
  return jsonError("An unexpected error occurred", 500, "internal_error");
}

export function handleRoute<T>(
  fn: () => Promise<NextResponse<T>>,
): Promise<NextResponse<T> | NextResponse<ApiErrorBody>> {
  return fn().catch(toErrorResponse);
}

export function getRequestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
