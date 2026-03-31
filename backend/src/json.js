import { createHttpError } from "./errors.js";

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError("invalid_json", 400);
  }
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body))
  });
  res.end(body);
}
