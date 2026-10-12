// 공용 비밀번호 잠금 (DESIGN.md 2.4)
// 비밀번호 확인과 "통과 표시" 만들기·확인을 맡는다. 서버 쪽 코드에서만 쓴다.

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

// 통과 표시를 담는 쿠키의 이름
export const SESSION_COOKIE = "mpb_session";
// 한 번 통과하면 같은 브라우저에서 7일 동안 유지한다.
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function requireEnv(name: "APP_PASSWORD" | "SESSION_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`.env에 ${name}가 없습니다.`);
  }
  return value;
}

// 두 글이 같은지, 걸리는 시간으로 내용을 짐작할 수 없게 비교한다.
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isCorrectPassword(input: string): boolean {
  return safeEqual(input, requireEnv("APP_PASSWORD"));
}

// 통과 표시에 붙이는 서명. 비밀 값을 모르면 만들 수 없다.
// 비밀번호를 함께 섞어, 비밀번호를 바꾸면 예전 통과 표시가 모두 무효가 되게 한다.
function sign(expiresAt: string): string {
  return createHmac("sha256", `${requireEnv("SESSION_SECRET")}:${requireEnv("APP_PASSWORD")}`)
    .update(expiresAt)
    .digest("base64url");
}

// 통과 표시를 만든다. "만료 시각.서명" 모양이다.
export function createSessionToken(now: number = Date.now()): string {
  const expiresAt = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

// 통과 표시가 우리가 만든 것이고 아직 기한이 남았는지 확인한다.
export function isValidSessionToken(token: string | undefined, now: number = Date.now()): boolean {
  if (!token) {
    return false;
  }
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) {
    return false;
  }
  return safeEqual(signature, sign(expiresAt)) && Number(expiresAt) > now;
}

// 지금 요청을 보낸 브라우저가 잠금을 통과했는지 확인한다.
export async function isUnlocked(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

// 잠금을 통과한 브라우저에 통과 표시를 심는다.
// 화면 쪽 코드가 읽거나 고칠 수 없는 쿠키(httpOnly)로 심는다.
export async function grantSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}
