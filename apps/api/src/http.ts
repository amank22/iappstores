import type { Response } from "express";
import type { ApiErrorResponse } from "@iappstores/contracts";

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  };

  res.status(status).json(body);
}
