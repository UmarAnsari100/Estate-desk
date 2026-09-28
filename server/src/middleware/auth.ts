import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../repositories/db.js";
export const auth: RequestHandler = async (req, res, next) => {
  try {
    const payload = jwt.verify(req.cookies?.session || "", env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "estate-desk",
      audience: "admin",
    }) as jwt.JwtPayload;
    if (
      !payload.sub ||
      !(await db.admin.findUnique({ where: { id: payload.sub } }))
    )
      throw new Error();
    res.locals.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
};
export const sameOrigin: RequestHandler = (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== env.CLIENT_URL
  ) {
    res.status(403).json({ error: "Invalid request origin" });
    return;
  }
  next();
};
