// 담당자 실명·전화번호·이메일을 걸러 낸다. (DESIGN.md 2.1의 ⑥, PRD 7장)
// 게시글 본문과 PDF에서 읽은 글자 모두에 적용한다. 담당 부서 이름은 남긴다.
// 자동으로 거르는 방식이라 완벽하지 않다. 가져온 뒤 표본을 눈으로 확인한다.

// 전화번호: 044-214-3360, 02)1234-5678, 010 1234 5678 등
const PHONE = /\(?\b0\d{1,2}\)?[\s.\-)]{1,2}\d{3,4}[\s.\-]\d{4}\b\)?/g;
// 이메일
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// 직급. PDF에서는 "팀 장", "과 장"처럼 글자 사이가 벌어져 나오기도 한다.
const RANK_WORDS = [
  "국장", "과장", "팀장", "단장", "실장", "센터장", "담당관", "심의관", "정책관",
  "서기관", "부이사관", "사무관", "행정관", "주무관", "전문관", "연구관", "연구사",
  "주무원", "실무관",
];
const RANK = `(?:${RANK_WORDS.map((word) => [...word].join("\\s*")).join("|")})`;
// 사람 이름으로 보는 한글 2~4글자
const NAME = "[가-힣]{2,4}";

const CONTACT_MARK = "[연락처]";
// 괄호에 싸여 있을 수도 있는 연락처 표시
const MARK = "[(（]?\\s*\\[연락처\\]\\s*[)）]?";

// "책임자 팀 장 김희준 (연락처)", "사무관 홍주연 (연락처)", "홍길동 사무관(연락처)"
const PERSON_WITH_CONTACT = new RegExp(
  `(?:(?:책임자|담당자)\\s*)?(?:${RANK}\\s*${NAME}|${NAME}\\s*${RANK})\\s*${MARK}`,
  "g",
);
// "담당자: 홍길동 (연락처)", "책임자 부단장 이성원 (연락처)"처럼
// 이름표와 연락처 사이에 한글 낱말이 1~4개 끼어 있는 부분. 목록에 없는 직급도 잡는다.
const LABELED_NAME_WITH_CONTACT = new RegExp(
  `(?:책임자|담당자|작성자|문의)\\s*[:：]?\\s*(?:[가-힣]+\\s*){1,4}${MARK}`,
  "g",
);
// "담당자"처럼 이름표만 홀로 있는 줄
const LABEL_ONLY_LINE = /^\s*(?:책임자|담당자|작성자)\s*$/;
// "책임자 팀 장 김희준"처럼 연락처 없이 역할·직급·이름만 이어진 부분
const ROLE_RANK_NAME = new RegExp(`(?:책임자|담당자)\\s*${RANK}\\s*${NAME}`, "g");
// 연락처를 지운 뒤 줄 끝에 홀로 남은 이름표
const DANGLING_LABEL = /(?:책임자|담당자|작성자|연락처|이메일|전화|문의)\s*[:：]?\s*$/;

export type RedactResult = {
  text: string;
  // 걸러 낸 전화번호·이메일의 수
  removedContacts: number;
};

export function redactPersonalInfo(text: string): RedactResult {
  let removedContacts = 0;

  const lines = text.split("\n").map((line) => {
    // 1) 전화번호와 이메일을 표시로 바꾼다.
    let cleaned = line.replace(PHONE, () => {
      removedContacts++;
      return CONTACT_MARK;
    });
    cleaned = cleaned.replace(EMAIL, () => {
      removedContacts++;
      return CONTACT_MARK;
    });
    const hadContact = cleaned.includes(CONTACT_MARK);

    // 2) 연락처에 붙어 있는 직급·이름을 연락처와 함께 지운다.
    cleaned = cleaned
      .replace(LABELED_NAME_WITH_CONTACT, "")
      .replace(PERSON_WITH_CONTACT, "");
    // 3) 연락처 없이 역할·직급·이름만 이어진 부분을 지운다.
    cleaned = cleaned.replace(ROLE_RANK_NAME, "");
    // 4) 남은 연락처 표시와 빈 괄호를 지운다.
    cleaned = cleaned.replaceAll(CONTACT_MARK, "").replace(/[(（]\s*[)）]/g, "");
    // 5) 연락처가 있던 줄 끝에 홀로 남은 이름표를 지운다.
    if (hadContact) {
      cleaned = cleaned.trimEnd().replace(DANGLING_LABEL, "");
    }

    // 6) 이름표만 홀로 있는 줄은 연락처 표의 일부이므로 지운다.
    if (LABEL_ONLY_LINE.test(cleaned)) {
      cleaned = "";
    }

    return cleaned.replace(/[ \t]{2,}/g, " ").trimEnd();
  });

  // 걸러 낸 뒤 비어 버린 줄이 여러 개 이어지면 하나로 줄인다.
  const result = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: result, removedContacts };
}
