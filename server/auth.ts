import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { Store } from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { storage, rawDb } from "./storage";
import type { User, SafeUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SafeUser {}
  }
}

// ── Password hashing (scrypt) ──
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const hash = scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, "hex");
  if (hash.length !== storedBuf.length) return false;
  return timingSafeEqual(hash, storedBuf);
}

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

// ── SQLite-backed session store ──
class SqliteSessionStore extends Store {
  private selectStmt = rawDb.prepare("SELECT data, expires_at FROM sessions WHERE sid = ?");
  private upsertStmt = rawDb.prepare(
    "INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at"
  );
  private deleteStmt = rawDb.prepare("DELETE FROM sessions WHERE sid = ?");
  private cleanupStmt = rawDb.prepare("DELETE FROM sessions WHERE expires_at < ?");

  constructor() {
    super();
    setInterval(() => {
      try {
        this.cleanupStmt.run(Date.now());
      } catch {}
    }, 60 * 60 * 1000).unref();
  }

  get(sid: string, cb: (err: any, session?: any) => void): void {
    try {
      const row = this.selectStmt.get(sid) as { data: string; expires_at: number } | undefined;
      if (!row) return cb(null, null);
      if (row.expires_at < Date.now()) {
        this.deleteStmt.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid: string, sess: any, cb?: (err?: any) => void): void {
    try {
      const expiresAt = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 1000 * 60 * 60 * 24 * 30;
      this.upsertStmt.run(sid, JSON.stringify(sess), expiresAt);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  destroy(sid: string, cb?: (err?: any) => void): void {
    try {
      this.deleteStmt.run(sid);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid: string, sess: any, cb?: () => void): void {
    this.set(sid, sess, () => cb?.());
  }
}

// ── Bearer-token compatibility ──
// Allows API clients to authenticate by sending `Authorization: Bearer <sid>`
// where <sid> is an active session ID. Keeps parity with existing bearer flows.
function bearerCompat(req: Request, _res: Response, next: NextFunction): void {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const token = header.slice(7).trim();
  if (!token) return next();
  try {
    const row = rawDb
      .prepare("SELECT data, expires_at FROM sessions WHERE sid = ?")
      .get(token) as { data: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now()) return next();
    const parsed = JSON.parse(row.data);
    const userId = parsed?.passport?.user;
    if (typeof userId !== "number") return next();
    const user = storage.getUserById(userId);
    if (!user) return next();
    (req as any).user = toSafeUser(user);
    (req as any).isAuthenticated = () => true;
  } catch {}
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ── Setup ──
export function setupAuth(app: Express): void {
  const isProd = process.env.NODE_ENV === "production";
  const sessionSecret =
    process.env.SESSION_SECRET ||
    (isProd
      ? (() => {
          console.warn(
            "[auth] SESSION_SECRET not set in production — using derived fallback (set SESSION_SECRET for stable sessions across restarts)"
          );
          return createHash("sha256").update("production-forge-fallback").digest("hex");
        })()
      : "dev-secret-change-me");

  // SameSite=None requires Secure=true. Default to Lax.
  const sameSiteEnv = (process.env.COOKIE_SAMESITE || "").toLowerCase();
  const sameSite: "lax" | "strict" | "none" =
    sameSiteEnv === "none" ? "none" : sameSiteEnv === "strict" ? "strict" : "lax";

  if (app.get("env") !== "test") {
    app.set("trust proxy", 1);
  }

  app.use(
    session({
      name: "forge.sid",
      secret: sessionSecret,
      store: new SqliteSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProd || sameSite === "none",
        sameSite,
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    })
  );

  passport.use(
    new LocalStrategy({ usernameField: "email", passwordField: "password" }, (email, password, done) => {
      try {
        const user = storage.getUserByEmail(email);
        if (!user) return done(null, false, { message: "Invalid credentials" });
        if (!verifyPassword(password, user.passwordHash)) {
          return done(null, false, { message: "Invalid credentials" });
        }
        return done(null, toSafeUser(user));
      } catch (err) {
        return done(err as Error);
      }
    })
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser((id: number, done) => {
    try {
      const user = storage.getUserById(id);
      if (!user) return done(null, false);
      done(null, toSafeUser(user));
    } catch (err) {
      done(err as Error);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(bearerCompat);

  // ── Auth routes ──
  app.post("/api/auth/signup", (req: Request, res: Response) => {
    try {
      const { email, password, displayName } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "email and password required" });
      }
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return res.status(400).json({ error: "Invalid email" });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      if (storage.getUserByEmail(normalized)) {
        return res.status(409).json({ error: "Email already registered" });
      }
      const user = storage.createUser({
        email: normalized,
        passwordHash: hashPassword(password),
        displayName: typeof displayName === "string" ? displayName : null,
        createdAt: new Date().toISOString(),
        resetToken: null,
        resetTokenExpiresAt: null,
      });
      const safe = toSafeUser(user);
      req.login(safe, (err) => {
        if (err) return res.status(500).json({ error: "Session error" });
        return res.json({ user: safe });
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: SafeUser | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({ user });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const done = (err?: any) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      req.session?.destroy(() => {
        res.clearCookie("forge.sid", { path: "/" });
        res.json({ ok: true });
      });
    };
    if (typeof req.logout === "function") {
      req.logout((err) => done(err));
    } else {
      done();
    }
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      return res.json({ user: req.user });
    }
    return res.json({ user: null });
  });

  app.post("/api/auth/reset-request", (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (typeof email !== "string") return res.status(400).json({ error: "email required" });
      const user = storage.getUserByEmail(email.trim().toLowerCase());
      if (user) {
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
        storage.updateUser(user.id, {
          resetToken: createHash("sha256").update(token).digest("hex"),
          resetTokenExpiresAt: expiresAt,
        });
        // Token delivery is out-of-band. Never return it in the response in production.
        if (process.env.NODE_ENV !== "production") {
          return res.json({ ok: true, devToken: token });
        }
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/reset", (req: Request, res: Response) => {
    try {
      const { email, token, password } = req.body || {};
      if (typeof email !== "string" || typeof token !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "email, token, password required" });
      }
      if (password.length < 8) return res.status(400).json({ error: "Password too short" });
      const user = storage.getUserByEmail(email.trim().toLowerCase());
      if (!user || !user.resetToken || !user.resetTokenExpiresAt) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      if (new Date(user.resetTokenExpiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      const supplied = createHash("sha256").update(token).digest("hex");
      const storedBuf = Buffer.from(user.resetToken, "hex");
      const suppliedBuf = Buffer.from(supplied, "hex");
      if (storedBuf.length !== suppliedBuf.length || !timingSafeEqual(storedBuf, suppliedBuf)) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      storage.updateUser(user.id, {
        passwordHash: hashPassword(password),
        resetToken: null,
        resetTokenExpiresAt: null,
      });
      const safe = toSafeUser(user);
      req.login(safe, (err) => {
        if (err) return res.status(500).json({ error: "Session error" });
        return res.json({ user: safe });
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
