// 잠금 화면에서 보낸 공용 비밀번호를 확인하는 서버 쪽 코드 (DESIGN.md 2.4)

import { grantSession, isCorrectPassword } from "@/lib/auth.ts";

// 틀렸을 때 답을 늦추는 시간. 비밀번호를 빠르게 여러 번 넣어 보는 것을 어렵게 한다.
const WRONG_PASSWORD_DELAY_MS = 1000;

export async function POST(request: Request) {
  let password: unknown;
  try {
    password = ((await request.json()) as { password?: unknown }).password;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    if (typeof password !== "string" || !isCorrectPassword(password)) {
      await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
      return Response.json({ error: "비밀번호가 맞지 않습니다" }, { status: 401 });
    }
    await grantSession();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/unlock]", error);
    return Response.json(
      { error: "잠금을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요" },
      { status: 500 },
    );
  }
}
