import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { DATA_ROOT } from "./store";

export type User = { id: string; email: string; passwordHash: string };
const file = path.join(DATA_ROOT, "users.json");
async function readUsers(): Promise<User[]> { try { const data: unknown = JSON.parse(await fs.readFile(file, "utf8")); return Array.isArray(data) ? data as User[] : []; } catch { return []; } }
async function writeUsers(users: User[]) { await fs.mkdir(DATA_ROOT, { recursive: true }); await fs.writeFile(file, JSON.stringify(users, null, 2), "utf8"); }
const publicUser = (user: User) => ({ id: user.id, email: user.email });
export async function register(email: string, password: string) { const users = await readUsers(); const normalized = email.trim().toLowerCase(); if (users.some((item) => item.email === normalized)) throw new Error("该邮箱已注册"); const user: User = { id: crypto.randomUUID(), email: normalized, passwordHash: await bcrypt.hash(password, 12) }; users.push(user); await writeUsers(users); return publicUser(user); }
export async function login(email: string, password: string) { const user = (await readUsers()).find((item) => item.email === email.trim().toLowerCase()); return user && await bcrypt.compare(password, user.passwordHash) ? publicUser(user) : null; }
export async function currentUser(id: string | undefined) { if (!id) return null; const user = (await readUsers()).find((item) => item.id === id); return user ? publicUser(user) : null; }
