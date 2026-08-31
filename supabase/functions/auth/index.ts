import { createHandler, AuthContext, mePayload } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import {
  findUserByEmail,
  isAccountActive,
  naiveIso,
  AuthUser,
} from "../_shared/auth-users.ts";
import { verifyPassword, hashPassword } from "../_shared/password.ts";
import { signAccessToken, signRefreshToken } from "../_shared/jwt.ts";
import { adminDb } from "../_shared/db.ts";
import {
  getLoginRestriction,
  identifierReference,
  safeIdentifier,
  recordFailedAttempt,
  failureMessage,
  publicLockoutData,
  logFailedLogin,
  writeAudit,
  writeLoginHistory,
  writeSecurityLog,
  LockoutInfo,
} from "../_shared/lockout.ts";
import {
  findActiveRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  saveRefreshToken,
  isRefreshTokenExpired,
} from "../_shared/refresh-tokens.ts";
import {
  upsertActiveSession,
  revokeActiveSessions,
  insertActivityEvent,
  upsertOnlineUser,
  removeOnlineUser,
  parseUserAgent,
} from "../_shared/sessions.ts";
import { verifyRefreshToken } from "../_shared/jwt.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import { relevantRoleConflicts } from "../_shared/rbac.ts";

const ACCESS_TTL_SECONDS = 900;
// A valid cost-12 BCrypt hash used only to equalize unknown-account password work.
const DUMMY_PASSWORD_HASH = "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

type Ctx = { ip: string; userAgent: string | null };

function requestCtx(ctx: AuthContext | null, req: Request): Ctx {
  return { ip: resolveClientIp(req).ip, userAgent: req.headers.get("User-Agent") };
}

function lockoutResponse(info: LockoutInfo) {
  const locked = info.lockSecondsRemaining > 0;
  return jsonResponse(
    {
      ...fail(failureMessage(info), locked ? "ACCOUNT_TEMP_LOCKED" : "INVALID_CREDENTIALS"),
      data: publicLockoutData(info),
    },
    locked ? 423 : 401,
  );
}

async function buildAuthResponse(user: AuthUser, ctx: Ctx) {
  const accessToken = await signAccessToken(
    user.row.email,
    user.roles.map((r) => `ROLE_${r}`).concat(user.permissions),
  );
  const refreshToken = await signRefreshToken(user.row.email);
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TTL_SECONDS,
    user: {
      id: user.row.id,
      firstName: user.row.first_name,
      lastName: user.row.last_name,
      fullName: `${user.row.first_name} ${user.row.last_name}`,
      email: user.row.email,
      employeeId: user.row.employee_id,
      department: user.row.department,
      position: user.row.position,
      avatarUrl: user.row.avatar_url,
      roles: user.roles,
      assignedRoles: user.assignedRoles,
      permissions: user.permissions,
      dashboardKey: user.dashboardKey,
    },
  };
}

async function handleLogin(_ctx: AuthContext | null, req: Request, body: unknown) {
  const b = body as Record<string, unknown> | null;
  const ctx = requestCtx(_ctx, req);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b?.password === "string" ? b.password : "";

  if (!email || !password) {
    return jsonResponse(
      fail("Validation failed", "VALIDATION_ERROR", ["Email is required", "Password is required"]),
      400,
    );
  }

  const user = await findUserByEmail(email);
  const reference = await identifierReference(email);
  const identifier = user?.row.email ?? safeIdentifier(reference);
  const lockout = await getLoginRestriction(email, reference);
  if (lockout.lockSecondsRemaining > 0) {
    await logFailedLogin(user, identifier, lockout, ctx.ip, ctx.userAgent ?? "", true);
    return lockoutResponse(lockout);
  }

  const passwordOk = await verifyPassword(password, user?.row.password_hash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordOk) {
    const info = await recordFailedAttempt(email, reference);
    await logFailedLogin(user, identifier, info, ctx.ip, ctx.userAgent ?? "");
    return lockoutResponse(info);
  }

  if (!isAccountActive(user)) {
    return jsonResponse(
      fail("Account is not active. Contact administrator.", "BUSINESS_RULE_VIOLATION"),
      422,
    );
  }

  const db = adminDb();
  const { data: finalized, error: finalizeError } = await db.rpc("finalize_login_success", {
    p_email: email,
    p_ip: ctx.ip,
  });
  if (finalizeError) throw new Error(`finalize_login_success failed: ${finalizeError.message}`);
  const finalizedRow = (Array.isArray(finalized) ? finalized[0] : finalized) as {
    allowed: boolean; failed_attempts: number; locked_until: string | null;
  } | null;
  if (!finalizedRow?.allowed) {
    const retryAt = finalizedRow?.locked_until ? new Date(finalizedRow.locked_until).toISOString() : null;
    const info: LockoutInfo = {
      accountExists: true,
      failedAttempts: finalizedRow?.failed_attempts ?? lockout.failedAttempts,
      retryAt,
      lockSecondsRemaining: retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)) : 0,
      counted: false,
    };
    await logFailedLogin(user, user.row.email, info, ctx.ip, ctx.userAgent ?? "", true);
    return lockoutResponse(info);
  }

  const auth = await buildAuthResponse(user, ctx);

  await revokeAllUserTokens(user.row.id);
  await saveRefreshToken(user.row.id, auth.refreshToken, ctx.ip, ctx.userAgent);

  await writeAudit(user, "LOGIN_SUCCESS", "AUTH", "User", user.row.id,
    "User logged in successfully", ctx.ip);
  await writeLoginHistory(user.row.email, user.row.id, ctx.ip, "SUCCESS", "", ctx.userAgent ?? "");
  await writeSecurityLog(user, "LOGIN_SUCCESS", "SUCCESS", "LOW", ctx.ip, ctx.userAgent,
    "User logged in successfully");

  const agent = parseUserAgent(ctx.userAgent);
  await upsertActiveSession(user, ctx.ip, ctx.userAgent);
  await insertActivityEvent({
    type: "USER_ONLINE", userId: user.row.id, username: user.row.email,
    fullName: `${user.row.first_name} ${user.row.last_name}`, email: user.row.email,
    role: user.assignedRoles[0] ?? user.roles[0] ?? "EMPLOYEE", action: "Signed in", ip: ctx.ip,
    device: agent.device, browser: agent.browser,
  });
  await upsertOnlineUser(user, ctx.ip, agent);

  return jsonResponse(ok(auth, "Login successful"), 200);
}

async function handleRefresh(_ctx: AuthContext | null, req: Request, body: unknown) {
  const b = body as Record<string, unknown> | null;
  const ctx = requestCtx(_ctx, req);
  const token = typeof b?.refreshToken === "string" ? b.refreshToken : "";
  if (!token) {
    return jsonResponse(fail("Refresh token is required", "VALIDATION_ERROR"), 400);
  }

  const row = await findActiveRefreshToken(token);
  if (!row) {
    return jsonResponse(fail("Invalid or expired token", "INVALID_TOKEN"), 401);
  }
  if (isRefreshTokenExpired(row)) {
    await revokeRefreshToken(row.id);
    return jsonResponse(fail("Invalid or expired token", "INVALID_TOKEN"), 401);
  }

  const payload = await verifyRefreshToken(token);
  if (!payload) {
    await revokeRefreshToken(row.id);
    return jsonResponse(fail("Invalid or expired token", "INVALID_TOKEN"), 401);
  }

  const user = await findUserByEmail(payload.sub);
  if (!user || user.row.id !== row.user_id) {
    await revokeRefreshToken(row.id);
    return jsonResponse(fail("Invalid or expired token", "INVALID_TOKEN"), 401);
  }

  const auth = await buildAuthResponse(user, ctx);
  await revokeRefreshToken(row.id);
  await saveRefreshToken(user.row.id, auth.refreshToken, ctx.ip, ctx.userAgent);

  return jsonResponse(ok(auth, "Token refreshed"), 200);
}

async function handleLogout(ctx: AuthContext | null, _req: Request, _body: unknown) {
  if (ctx) {
    await revokeAllUserTokens(ctx.userId);
    await revokeActiveSessions(ctx.user);
    await insertActivityEvent({
      type: "USER_OFFLINE", userId: ctx.userId, username: ctx.email,
      fullName: `${ctx.user.row.first_name} ${ctx.user.row.last_name}`, email: ctx.email,
      role: ctx.user.assignedRoles[0] ?? ctx.roles[0] ?? "EMPLOYEE", action: "Signed out", ip: "",
      device: "", browser: "",
    });
    await removeOnlineUser(ctx.email);
    await writeAudit(ctx.user, "LOGOUT", "AUTH", "User", ctx.userId, "User logged out", null);
    await writeSecurityLog(ctx.user, "LOGOUT", "SUCCESS", "LOW", null, null, "User logged out");
  }
  return jsonResponse(ok("Logged out successfully"), 200);
}

async function handleHeartbeat(ctx: AuthContext | null, req: Request, _body: unknown) {
  if (ctx) {
    const c = requestCtx(ctx, req);
    await upsertActiveSession(ctx.user, c.ip, c.userAgent);
    await upsertOnlineUser(ctx.user, c.ip, parseUserAgent(c.userAgent));
  }
  return jsonResponse(ok("Heartbeat recorded"), 200);
}

async function handleMe(ctx: AuthContext | null, _req: Request, _body: unknown) {
  return jsonResponse(ok(mePayload(ctx!), "User profile"), 200);
}

async function handleRbacDashboard(ctx: AuthContext | null, _req: Request, _body: unknown) {
  return jsonResponse(ok({
    dashboardKey: ctx!.user.dashboardKey,
    assignedRoles: ctx!.user.assignedRoles,
    effectiveRoles: ctx!.roles,
    permissions: ctx!.permissions,
    activeConstraints: await relevantRoleConflicts(ctx!.roles),
  }), 200);
}

async function handleForgotPassword(_ctx: AuthContext | null, req: Request, body: unknown) {
  const b = body as Record<string, unknown> | null;
  const ctx = requestCtx(_ctx, req);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email) {
    return jsonResponse(fail("Validation failed", "VALIDATION_ERROR", ["Email is required"]), 400);
  }

  const user = await findUserByEmail(email);
  if (user) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const db = adminDb();
    await db.from("users").update({
      password_reset_token: token,
      password_reset_expires_at: naiveIso(expiresAt),
    }).eq("id", user.row.id);
    await writeAudit(user, "PASSWORD_RESET_REQUESTED", "AUTH", "User", user.row.id,
      "Password reset requested", ctx.ip);
  }

  return jsonResponse(
    ok("If your email is registered, you will receive password reset instructions."),
    200,
  );
}

async function handleResetPassword(_ctx: AuthContext | null, req: Request, body: unknown) {
  const b = body as Record<string, unknown> | null;
  const ctx = requestCtx(_ctx, req);
  const token = typeof b?.token === "string" ? b.token : "";
  const newPassword = typeof b?.newPassword === "string" ? b.newPassword : "";
  const confirmPassword = typeof b?.confirmPassword === "string" ? b.confirmPassword : "";

  const errors: string[] = [];
  if (!token) errors.push("Reset token is required");
  if (!newPassword) errors.push("New password is required");
  if (newPassword.length < 8 || newPassword.length > 100) {
    errors.push("Password must be between 8 and 100 characters");
  }
  if (newPassword && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(newPassword)) {
    errors.push("Password must contain uppercase, lowercase, digit, and special character");
  }
  if (!confirmPassword) errors.push("Confirm password is required");
  if (newPassword !== confirmPassword) errors.push("Passwords do not match");
  if (errors.length) {
    return jsonResponse(fail("Validation failed", "VALIDATION_ERROR", errors), 400);
  }

  const db = adminDb();
  const { data: userRows, error: findErr } = await db
    .from("users")
    .select("*")
    .eq("password_reset_token", token)
    .eq("is_deleted", false);
  if (findErr) throw new Error(`reset lookup failed: ${findErr.message}`);

  const userRow = (userRows ?? []).find((u) => {
    const expiresAt = (u as { password_reset_expires_at: string | null }).password_reset_expires_at;
    return expiresAt !== null && new Date(expiresAt) > new Date();
  });
  if (!userRow) {
    return jsonResponse(fail("Invalid or expired password reset token", "INVALID_RESET_TOKEN"), 401);
  }

  const hashed = await hashPassword(newPassword);
  const { error: updErr } = await db.from("users").update({
    password_hash: hashed,
    password_reset_token: null,
    password_reset_expires_at: null,
  }).eq("id", (userRow as { id: string }).id);
  if (updErr) throw new Error(`reset update failed: ${updErr.message}`);

  const user = await findUserByEmail((userRow as { email: string }).email);
  if (user) {
    await revokeAllUserTokens(user.row.id);
    await writeAudit(user, "PASSWORD_RESET_SUCCESS", "AUTH", "User", user.row.id,
      "Password reset successfully", ctx.ip);
  }

  return jsonResponse(ok("Password reset successfully. Please login."), 200);
}

async function handleHrAssistance(_ctx: AuthContext | null, req: Request, body: unknown) {
  const b = body as Record<string, unknown> | null;
  const ctx = requestCtx(_ctx, req);
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const subject = typeof b?.subject === "string" ? b.subject.trim() : "";
  const message = typeof b?.message === "string" ? b.message.trim() : "";

  if (!name || !email || !subject || !message) {
    return jsonResponse(
      fail("Validation failed", "VALIDATION_ERROR",
        ["Name is required", "Email is required", "Subject is required", "Message is required"]),
      400,
    );
  }

  const db = adminDb();
  const { data, error } = await db.from("hr_assistance_requests").insert({
    requester_name: name,
    requester_email: email,
    subject,
    message,
    status: "PENDING",
    priority: "NORMAL",
    ip_address: ctx.ip,
    user_agent: ctx.userAgent,
  }).select("id").single();
  if (error) throw new Error(`hr_assistance insert failed: ${error.message}`);

  await writeAudit(null, "HR_ASSISTANCE_REQUESTED", "AUTH", "HrAssistanceRequest",
    data.id as string, `HR assistance request submitted by ${email}`, ctx.ip);

  return jsonResponse(
    ok("Your request has been submitted. The HR Department will contact you shortly."),
    200,
  );
}

const routes = [
  { method: "POST", path: "/auth/login", guard: { kind: "public" }, handler: handleLogin },
  { method: "POST", path: "/auth/refresh", guard: { kind: "public" }, handler: handleRefresh },
  { method: "POST", path: "/auth/logout", guard: { kind: "auth" }, handler: handleLogout },
  { method: "POST", path: "/auth/heartbeat", guard: { kind: "auth" }, handler: handleHeartbeat },
  { method: "GET", path: "/auth/me", guard: { kind: "auth" }, handler: handleMe },
  { method: "GET", path: "/rbac/me/dashboard", guard: { kind: "auth" }, handler: handleRbacDashboard },
  { method: "POST", path: "/auth/forgot-password", guard: { kind: "public" }, handler: handleForgotPassword },
  { method: "POST", path: "/auth/reset-password", guard: { kind: "public" }, handler: handleResetPassword },
  { method: "POST", path: "/auth/hr/assistance", guard: { kind: "public" }, handler: handleHrAssistance },
] as const;

Deno.serve(createHandler(routes as never, { name: "auth" }));
