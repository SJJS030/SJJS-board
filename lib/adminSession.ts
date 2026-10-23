import { cookies } from "next/headers";
import { verifyAdminSessionToken } from "./adminToken";

export const ADMIN_COOKIE = "sjjs_admin";

export async function isAdminRequest() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? verifyAdminSessionToken(token) : false;
}
