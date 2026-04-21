// Smoke test for the Forge persistent auth standard.
// Boots the dev server, exercises signup/me/logout/login flows, checks
// that the session cookie persists across requests (simulating a hard refresh).
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT || "5199";
const BASE = `http://127.0.0.1:${PORT}`;

function parseSetCookie(headers) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  const jar = {};
  for (const line of raw) {
    if (!line) continue;
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return { jar, raw };
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function run() {
  const proc = spawn("npx", ["tsx", "server/index.ts"], {
    env: { ...process.env, PORT, NODE_ENV: "development", SKIP_STATIC: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  proc.stdout.on("data", (b) => {
    const s = b.toString();
    if (s.includes("serving on port")) ready = true;
    process.stdout.write(`[server] ${s}`);
  });
  proc.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));

  try {
    for (let i = 0; i < 50 && !ready; i++) await sleep(200);
    if (!ready) throw new Error("server did not start");

    const email = `smoke-${Date.now()}@forge.test`;
    const password = "correct horse battery staple";

    // signup
    const signupRes = await fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Smoke" }),
    });
    if (signupRes.status !== 200) throw new Error(`signup failed: ${signupRes.status} ${await signupRes.text()}`);
    const { jar } = parseSetCookie(signupRes.headers);
    if (!jar["forge.sid"]) throw new Error("no forge.sid cookie set on signup");
    const setCookieRaw = signupRes.headers.get("set-cookie") || "";
    if (!/HttpOnly/i.test(setCookieRaw)) throw new Error("cookie missing HttpOnly");
    if (!/SameSite=/i.test(setCookieRaw)) throw new Error("cookie missing SameSite");
    console.log("✓ signup sets HttpOnly SameSite cookie");

    // me with cookie — simulates hard refresh
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: cookieHeader(jar) },
    });
    const meData = await meRes.json();
    if (!meData.user || meData.user.email !== email) throw new Error("me did not return user");
    console.log("✓ /api/auth/me restores user from cookie (hard-refresh parity)");

    // me without cookie — anonymous
    const anonRes = await fetch(`${BASE}/api/auth/me`);
    const anonData = await anonRes.json();
    if (anonData.user !== null) throw new Error("anonymous /me returned a user");
    console.log("✓ /api/auth/me returns null without cookie");

    // logout
    const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookieHeader(jar) },
    });
    if (logoutRes.status !== 200) throw new Error(`logout failed: ${logoutRes.status}`);
    console.log("✓ logout clears session");

    // me after logout using same cookie — should be anonymous
    const afterLogout = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: cookieHeader(jar) },
    });
    const afterData = await afterLogout.json();
    if (afterData.user !== null) throw new Error("session was not invalidated on server");
    console.log("✓ server session invalidated after logout");

    // login again
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (loginRes.status !== 200) throw new Error(`login failed: ${loginRes.status}`);
    console.log("✓ login succeeds with existing credentials");

    // login with wrong password
    const badLogin = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "nope" }),
    });
    if (badLogin.status !== 401) throw new Error(`bad login should 401, got ${badLogin.status}`);
    console.log("✓ wrong password rejected");

    console.log("\nAll smoke checks passed.");
  } finally {
    proc.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
});
