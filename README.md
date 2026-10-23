# SJJS

Next.js 프론트엔드와 서버 API를 Vercel에서 실행하고, Supabase에 데이터를 저장하는 공개 메모 보드입니다. 누구나 메모를 읽고 작성할 수 있고, 작성자는 숫자 4자리 비밀번호로 자신의 메모를 삭제합니다. 관리자는 로그인 후 개별 메모 또는 전체 메모를 삭제할 수 있습니다.

## 로컬 실행

1. Node.js **24.x**를 설치하고, `package.json`이 있는 디렉터리에서 의존성을 설치합니다. Windows PowerShell에서 실행 정책 오류가 나면 `npm` 대신 `npm.cmd`를 사용하세요.

```bash
npm ci
```

2. Supabase 프로젝트를 만들고 SQL Editor에서 **수정된 `schema.sql` 전체**를 실행합니다. 기존 버전의 스키마에 다시 실행해도 메모는 유지되며 권한과 함수가 갱신됩니다. Data API에서 `public` 스키마가 노출되어 있어야 합니다.
3. 프로젝트 URL과 **레거시 `anon` 키**, **레거시 `service_role` 키**를 준비하고 환경 변수 생성기를 실행합니다. 비밀 값과 관리자 비밀번호는 화면에 표시하지 않으며 기존 `.env.local`이 있으면 덮어쓰지 않습니다.

```bash
npm run setup
```

4. 개발 서버를 실행하고 `http://localhost:3000`에 접속합니다.

```bash
npm run dev
```

## Supabase 레거시 환경 변수

Supabase Dashboard의 **Settings → API Keys**에서 Legacy API Keys(레거시 `anon`, `service_role`) 항목의 키를 사용합니다. 두 키는 `eyJ`로 시작하는 JWT입니다. 프로젝트 URL은 같은 프로젝트의 URL을 사용하세요. 이 프로젝트의 설정 안내는 레거시 키를 기준으로 합니다.

`.env.local`의 Supabase 변수는 다음 세 개입니다. 아래 설명 부분을 실제 값으로 바꿔 입력하세요.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=레거시-anon-키
SUPABASE_SERVICE_ROLE_KEY=레거시-service_role-키
```

`anon`은 브라우저의 목록 조회에, `service_role`은 서버 API의 쓰기·삭제와 요청 제한에 사용됩니다. `JWT_SECRET`이나 DB 비밀번호는 필요하지 않습니다. `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`은 SJJS 관리자 기능용 별도 설정이며 계속 필요합니다. 기존 `.env.local`이 있으면 생성기 대신 해당 파일을 직접 수정하고 개발 서버를 재시작하세요.

공식 설명: [Supabase 레거시 anon / service_role API 키](https://supabase.com/docs/guides/getting-started/api-keys#legacy-anon-and-service_role-keys).

## Vercel 배포

1. 이 프로젝트를 GitHub 저장소에 올리고 Vercel에서 Import합니다. `.env.local`은 Git에 올리지 마세요.
2. Framework Preset은 **Next.js**, Root Directory는 **`package.json`이 있는 폴더**를 선택합니다. 현재 작업 경로는 `C:\padlet\padlet`입니다. 저장소 루트에 `package.json`이 있으면 `./`, 저장소 안의 `padlet/`에 있으면 `padlet`을 선택합니다.
3. Node.js Version은 **24.x**, Install Command는 `npm ci`, Build Command는 `npm run build`로 설정합니다. Output Directory는 Next.js 기본값을 사용합니다. 서버 API가 필요하므로 정적 내보내기(`output: "export"`)는 사용하지 않습니다.
4. Project Settings → Environment Variables에 아래 다섯 값을 등록합니다. Production과 사용하는 Preview 환경 모두에 설정하세요.

| 이름 | 값 | 브라우저 공개 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 예 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 레거시 `anon` JWT 키 | 예 |
| `SUPABASE_SERVICE_ROLE_KEY` | 레거시 `service_role` JWT 키 | 아니요 |
| `ADMIN_PASSWORD_HASH` | bcrypt 관리자 비밀번호 해시 | 아니요 |
| `ADMIN_SESSION_SECRET` | 32자 이상의 무작위 문자열 | 아니요 |

5. `.env.local`에서 복사할 경우 Vercel 값에는 바깥따옴표를 넣지 말고, **`ADMIN_PASSWORD_HASH`의 `\$`를 `$`로 바꾸세요.** `.env.local`에서는 Next.js의 변수 확장을 막기 위해 역슬래시가 필요하지만, Vercel 입력 화면에는 원래 해시를 넣어야 합니다. 세 서버 전용 변수에는 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.
6. Deploy 후 메모 생성, 새로고침 후 유지, 틀린/맞는 비밀번호로 삭제, 관리자 로그인/개별 삭제/로그아웃을 확인합니다. 전체 삭제는 임시 데이터만 있는 보드에서 확인하세요. 공개 환경 변수를 바꿨다면 다시 배포해야 브라우저 번들에 적용됩니다.

수동 설정을 원하면 `.env.local.example`을 `.env.local`로 복사해 채워도 됩니다. `npm run setup`은 관리자 비밀번호를 최소 12자, UTF-8 72바이트 이하로 제한하고 bcrypt 해시와 무작위 세션 키를 생성합니다.

## 검증

```bash
npm run lint
npm test
npm run build
npm run test:integration
npm audit --omit=dev
```

`npm test`는 관리자 토큰의 만료·변조·설정 변경, API 입력 검증, 내장 PostgreSQL(PGlite)을 이용한 실제 SQL 권한과 요청 제한을 검사합니다. 통합 검사는 프로덕션 빌드 서버와 로컬 Supabase API 대역을 실행해 HTTP 동작을 검사하므로 먼저 빌드해야 합니다. 실제 Supabase 프로젝트와 Vercel 배포 검증은 별도로 필요합니다.

## 문제 해결

- 목록을 불러오지 못하면 Supabase URL/공개 키, Data API, `schema.sql` 적용 여부를 확인하세요. 실패는 보드에 계속 표시되며 동기화 버튼으로 다시 시도할 수 있습니다.
- 쓰기 API가 503을 반환하면 수정된 SQL의 `consume_rate_limit` 함수와 서버용 키를 확인하세요. 요청 제한 DB에 연결되지 않으면 쓰기 요청을 허용하지 않습니다.
- 관리자 로그인이 실패하면 해시의 `$` 처리와 32자 이상 세션 키를 확인하세요. Vercel 환경 변수를 바꾼 후에는 다시 배포하세요.
- 다른 브라우저에서 작성한 메모는 동기화 버튼이나 새로고침으로 반영됩니다. 실시간 구독은 사용하지 않습니다.
- `npm audit` 전체 검사에는 Next.js ESLint 도구의 `braces` 관련 개발 의존성 경고가 남을 수 있습니다. `npm audit fix --force`는 Next.js 설정을 구버전으로 낮추므로 사용하지 마세요. 실행 의존성은 `npm audit --omit=dev`로 별도 확인합니다.

## 보안 구조

- 브라우저는 공개 URL/anon key로 메모 목록만 조회합니다.
- DB의 공개 SELECT 권한은 `id`, `title`, `content`, `created_at`에만 부여합니다. 비밀번호 해시 조회, 직접 작성·수정·삭제는 금지합니다.
- 메모 생성 시 4자리 비밀번호 해시는 서버 API에서 bcrypt로 만듭니다.
- 일반 삭제는 서버에서 해시를 비교한 뒤 service role로 수행합니다.
- 관리자 인증과 삭제는 HttpOnly·SameSite=Strict 쿠키를 사용하는 서버 API에서 수행합니다. 프로덕션 쿠키는 Secure이며 서버가 8시간 만료를 검증합니다. 관리자 해시나 세션 키 변경 시 기존 토큰은 무효가 됩니다.
- 요청 제한은 Vercel의 여러 인스턴스가 공유하는 DB 카운터로 처리합니다. 10분 동안 IP별 작성 30회, 관리자 로그인 10회, 일반 삭제 30회, 메모별 일반 삭제 시도 10회입니다. 정상 요청도 횟수에 포함되며 같은 공인 IP를 쓰는 사용자는 IP별 한도를 공유합니다.
- 요청 제한에는 IP 원문 대신 HMAC 키만 저장하고, 만료 후 하루 지난 카운터는 다음 요청 때 정리합니다.
- 비어 있는 보드, 로딩, 검색 결과 없음, 연결 오류를 구분해 표시합니다.

참고: [Supabase 열 권한](https://supabase.com/docs/guides/database/postgres/column-level-security), [Vercel 환경 변수](https://vercel.com/docs/environment-variables), [Vercel 요청 헤더](https://vercel.com/docs/headers/request-headers).
