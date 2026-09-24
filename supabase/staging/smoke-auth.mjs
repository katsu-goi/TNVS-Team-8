import { QA_ACCOUNTS, equalSets, assertStagingEnvironment } from "./lib.mjs";

const { url } = assertStagingEnvironment({ requireServiceKey: false });
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY?.trim();
if (!anonKey || anonKey.toLowerCase().includes("replace-in")) {
  throw new Error("STAGING_SUPABASE_ANON_KEY is required");
}
for (const account of QA_ACCOUNTS) {
  const password = process.env[account.passwordEnv]?.trim();
  if (!password || password.toLowerCase().includes("replace-in")) throw new Error(`${account.passwordEnv} is required`);
}

const endpoint = (path) => `${url}/functions/v1/auth${path}`;
const request = (path, options = {}) => fetch(endpoint(path), {
  ...options,
  headers: { apikey: anonKey, "content-type": "application/json", ...(options.headers ?? {}) },
});

const unauthenticated = await request("/auth/me");
if (unauthenticated.status !== 401) {
  throw new Error(`Unauthenticated /auth/me returned ${unauthenticated.status}, expected 401`);
}
console.log("PASS | unauthenticated /auth/me | 401");

for (const account of QA_ACCOUNTS) {
  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: account.email, password: process.env[account.passwordEnv] }),
  });
  if (!login.ok) throw new Error(`${account.name} login failed with ${login.status}`);
  const loginEnvelope = await login.json();
  const accessToken = loginEnvelope?.data?.accessToken;
  const refreshToken = loginEnvelope?.data?.refreshToken;
  if (!accessToken || !refreshToken) throw new Error(`${account.name} login response did not contain both tokens`);

  const me = await request("/auth/me", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!me.ok) throw new Error(`${account.name} /auth/me failed with ${me.status}`);
  const profile = (await me.json())?.data;
  if (!profile || profile.email !== account.email || !equalSets(profile.assignedRoles ?? [], account.roles)) {
    throw new Error(`${account.name} /auth/me assigned roles are incorrect`);
  }
  if (!Array.isArray(profile.roles) || !Array.isArray(profile.permissions)) {
    throw new Error(`${account.name} /auth/me omitted effective roles or permissions`);
  }

  const logout = await request("/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ refreshToken }),
  });
  if (!logout.ok) throw new Error(`${account.name} logout failed with ${logout.status}`);
  console.log(`PASS | ${account.name} | assigned=${account.roles.join("+")} effective=${profile.roles.join("+")}`);
}

console.log("All 17 staging QA identities authenticated successfully; tokens were not printed or persisted.");
