import type { NextFunction, Request, Response } from "express";

export class ApiGreska extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const posalji = (response: Response, status: number, code: string, message: string, details: Record<string, unknown> = {}) => {
  response.status(status).json({ error: { code, message, details } });
};

export function greskaHandler(err: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (err instanceof ApiGreska) {
    posalji(response, err.status, err.code, err.message, err.details);
    return;
  }
  console.error(err);
  posalji(response, 500, "GRESKA_SERVERA", "Došlo je do neočekivane greške na serveru.");
}

export const asyncRuta = <Req extends Request>(
  fn: (request: Req, response: Response, next: NextFunction) => Promise<void>,
) => (request: Req, response: Response, next: NextFunction) => {
  fn(request, response, next).catch(next);
};
