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

// 보도자료 끝의 담당자 표는 "담당 부서"로 시작한다.
const CONTACT_TABLE_START = /^\s*담당\s*(?:부서|부처)/;
// 표 안에서 줄 끝에 남은 "담당자", "담당자 사무관" 같은 이름표
const TRAILING_ROLE = new RegExp(`\\s*(?:책임자|담당자)(?:\\s*${RANK})?\\s*$`);
// 표 안에서 "사무관 홍길동"처럼 직급과 이름만 있는 줄
const RANK_NAME_LINE = new RegExp(`^\\s*${RANK}\\s*${NAME}\\s*$`);
// 흔한 성씨. 표 안에서 이름만 홀로 있는 줄을 알아보는 데 쓴다.
const SURNAMES =
  "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명반왕금옥육인맹제모탁어은편용";
const BARE_NAME_LINE = new RegExp(`^\\s*[${SURNAMES}][가-힣]{1,2}\\s*$`);
// "예산실", "감사관"처럼 부서 이름으로 끝나는 글자. 이런 줄은 이름으로 보지 않는다.
const DEPARTMENT_SUFFIX = /[과팀실국단관처청]\s*$/;

// 표 안의 부서·기관 이름 줄. 예: "민간투자정책과", "<총괄> 재정집행과", "기획예산처 재정성과국"
const DEPARTMENT_LINE =
  /^\s*(?:<[^>]{1,10}>\s*)?[가-힣A-Za-z0-9·\s]{1,28}(?:과|팀|실|국|관|단|부|처|청|원|회|센터|본부|은행)\s*$/;

// 담당자 표 안에서 줄이 나뉘어 이름만 따로 떨어진 경우를 걸러 낸다.
// 예: "담당자 사무관" 다음 줄부터 이름이 한 줄에 하나씩 이어지는 표
function redactContactTable(lines: string[]): string[] {
  let inTable = false;
  return lines.map((line) => {
    const isName = BARE_NAME_LINE.test(line) && !DEPARTMENT_SUFFIX.test(line);
    if (CONTACT_TABLE_START.test(line)) {
      inTable = true;
    } else if (
      inTable &&
      line.trim() !== "" &&
      !isName &&
      !RANK_NAME_LINE.test(line) &&
      !TRAILING_ROLE.test(line) &&
      !DEPARTMENT_LINE.test(line)
    ) {
      // 표에 나올 만한 줄(부서 이름, 이름표, 이름)이 아니면 표가 끝난 것으로 본다.
      // 표 밖의 "제조", "서울" 같은 짧은 낱말을 이름으로 잘못 지우지 않기 위해서다.
      inTable = false;
    }
    if (!inTable) {
      return line;
    }
    if (RANK_NAME_LINE.test(line) || isName) {
      return "";
    }
    return line.replace(TRAILING_ROLE, "");
  });
}

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
    // 5) 연락처가 있던 줄 끝에 홀로 남은 이름표를 지운다.
    if (hadContact) {
      cleaned = cleaned
        .replaceAll(CONTACT_MARK, "")
        .replace(/[(（]\s*[)）]/g, "")
        .trimEnd()
        .replace(DANGLING_LABEL, "");
    }

    // 6) 이름표만 홀로 있는 줄은 연락처 표의 일부이므로 지운다.
    if (LABEL_ONLY_LINE.test(cleaned)) {
      cleaned = "";
    }

    return cleaned.replace(/[ \t]{2,}/g, " ").trimEnd();
  });

  // 걸러 낸 뒤 비어 버린 줄이 여러 개 이어지면 하나로 줄인다.
  const result = redactContactTable(lines)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: result, removedContacts };
}
