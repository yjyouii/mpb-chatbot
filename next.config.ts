import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 응답에 붙이는 보안 헤더
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 다른 사이트가 이 화면을 자기 화면 안에 끼워 넣지 못하게 한다.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // 브라우저가 파일 종류를 멋대로 짐작하지 못하게 한다.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 출처 링크를 눌러 나갈 때 이 챗봇의 주소를 알려 주지 않는다.
          { key: "Referrer-Policy", value: "no-referrer" },
          // 사내용 화면이 검색 사이트에 잡히지 않게 한다.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
