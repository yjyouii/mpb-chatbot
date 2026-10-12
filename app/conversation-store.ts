// 대화 기록을 사용자 컴퓨터의 브라우저 안(localStorage)에 저장한다. (DESIGN.md 2.3)
// 서버로 보내지 않는다. 다른 컴퓨터·다른 브라우저에서는 보이지 않는다.

// 답변 아래에 보여 주는 출처 하나. 서버가 문서 저장소에서 꺼내 준 값이다.
export type Source = {
  title: string;
  publishedDate: string;
  url: string;
  hasUnreadAttachment: boolean;
};

export type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  // 답변의 종류. 서버가 알려 준 값이다. (answer, not_found, clarify, smalltalk)
  kind?: string;
  sources?: Source[];
  hasMoreSources?: boolean;
  // 답변을 기다리는 중이거나 오류로 끝난 말풍선. 저장하지 않고, 직전 대화로도 보내지 않는다.
  unfinished?: boolean;
};

export type Conversation = {
  id: string;
  // 목록에 보이는 제목. 첫 질문의 앞 20글자다.
  title: string;
  messages: Message[];
  // 마지막으로 주고받은 시각. 최근 대화가 위에 오게 하는 데 쓴다.
  updatedAt: number;
};

const STORAGE_KEY = "mpb-chatbot:conversations";
const TITLE_LENGTH = 20;
// 브라우저 저장 공간을 넘기지 않도록, 가장 최근 대화만 이 개수까지 남긴다.
const MAX_CONVERSATIONS = 50;
const EMPTY: Conversation[] = [];

let cache: Conversation[] | null = null;
const listeners = new Set<() => void>();

function read(): Conversation[] {
  if (cache === null) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      cache = raw ? (JSON.parse(raw) as Conversation[]) : EMPTY;
    } catch {
      // 저장소를 쓸 수 없거나 내용이 깨졌으면 기록이 없는 것으로 본다.
      cache = EMPTY;
    }
  }
  return cache;
}

function write(next: Conversation[]) {
  cache = next;
  try {
    if (next.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // 저장 공간이 없거나 저장이 막혀 있어도 화면은 계속 쓸 수 있게 한다.
  }
  for (const listener of listeners) {
    listener();
  }
}

// 아래 셋은 React의 useSyncExternalStore에 넘겨, 저장된 기록이 바뀌면 화면이 다시 그려지게 한다.
export function subscribe(listener: () => void): () => void {
  // 같은 브라우저의 다른 창에서 기록이 바뀌면 다시 읽는다.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cache = null;
      listener();
    }
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getConversations(): Conversation[] {
  return read();
}

// 서버에서 화면을 미리 그릴 때는 브라우저 저장소가 없으므로 빈 목록을 쓴다.
export function getServerConversations(): Conversation[] {
  return EMPTY;
}

// 끝까지 주고받은 질문·답만 남긴다. 기다리는 중이거나 오류로 끝난 말풍선과 그 질문은 뺀다.
function finishedOnly(messages: Message[]): Message[] {
  const kept: Message[] = [];
  for (let index = 0; index + 1 < messages.length; index++) {
    const question = messages[index];
    const answer = messages[index + 1];
    if (question.role === "user" && answer.role === "assistant" && !answer.unfinished) {
      kept.push(question, answer);
    }
  }
  return kept;
}

// 대화 하나를 저장한다. 이미 있는 대화면 내용을 바꾸고 맨 위로 올린다.
export function saveConversation(id: string, messages: Message[]) {
  const finished = finishedOnly(messages);
  if (finished.length === 0) {
    return;
  }
  const firstQuestion = finished[0].text.replace(/\s+/g, " ").trim();
  const conversation: Conversation = {
    id,
    title:
      firstQuestion.length > TITLE_LENGTH
        ? `${firstQuestion.slice(0, TITLE_LENGTH)}…`
        : firstQuestion,
    messages: finished,
    updatedAt: Date.now(),
  };
  write(
    [conversation, ...read().filter((item) => item.id !== id)].slice(0, MAX_CONVERSATIONS),
  );
}

// 저장된 대화 기록을 한꺼번에 지운다.
export function clearConversations() {
  write(EMPTY);
}
