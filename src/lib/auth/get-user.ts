import { getSession } from "./session";

export async function getCurrentUser() {
  const session = await getSession();
  if (!session || !session.user) return null;
  return session.user;
}
