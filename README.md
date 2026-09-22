# Sajurium Client

사주리움의 공개 웹 클라이언트 저장소입니다. Next.js 16과 React 19를 사용하며, 패키지 관리는 Bun 1.3.14를 기준으로 합니다.

핵심 사용자 흐름은 Sajubase API에 연결됩니다. 익명 세션, 프로필 저장, 명식 계산, 무료 리포트, 상담 답변, 상품 카탈로그, 서버 주문, 이용권 원장, 보관함을 실제 API로 읽고 씁니다. 일부 장기 확장·운영 화면은 명시적으로 프로토타입 상태를 유지합니다.

## 로컬 실행

```bash
bunx bun@1.3.14 install --frozen-lockfile
bunx bun@1.3.14 run dev
```

기본 개발 서버는 `http://localhost:3000`에서 실행됩니다. `NEXT_PUBLIC_SAJURIUM_API_URL`로 API 주소를 지정하며, 로컬 개발·Playwright 통합 기본값은 `http://localhost:8000`입니다.

소셜 로그인 화면은 `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED=true`와 해당 제공자의 공개 client ID가 있을 때만 Google/Apple 버튼을 표시합니다. ID 토큰을 백엔드 `/auth/social`에 전달한 뒤 기존 익명 데이터를 이전합니다. 운영에서 이 값을 켜려면 백엔드의 제공자별 검증과 계정 연결 정책이 먼저 준비돼야 합니다. Kakao 웹 로그인은 인가 코드의 서버 교환 계약이 확정될 때 연결합니다.

알림 화면은 서버의 알림 내역과 선호 설정을 읽습니다. 브라우저 푸시 기기 등록은 백엔드의 FCM 등록 식별자 계약과 실제 발송 경로가 정해진 뒤 연결하며, `NEXT_PUBLIC_PUSH_ENABLED`는 그때까지 `false`로 둡니다.

Production build는 로컬 주소로 잘못 배포되는 일을 막기 위해 명시적인 비로컬 API origin을 요구합니다.

```bash
NEXT_PUBLIC_SAJURIUM_API_URL=https://api.example.com bunx bun@1.3.14 run build
```

CI에서는 GitHub Actions variable `SAJURIUM_API_URL`이 위 환경변수로 주입됩니다. 이 variable이 비어 있거나 localhost·잘못된 URL이면 quality/deploy 전에 build가 실패합니다.

## 검증

```bash
bunx bun@1.3.14 run test:quality
```

이 명령은 저장소 OpenAPI와 실제 FastAPI OpenAPI 생성물 드리프트, lint, TypeScript, 단위 테스트, production build, Playwright E2E를 차례로 검사합니다. 실제 백엔드 계약 검사를 위해 `SAJURIUM_BACKEND_OPENAPI_URL`에 실행 중인 서버의 OpenAPI JSON URL을 지정해야 합니다.

## 저장소 경계

- `openapi/sajurium.yaml`은 클라이언트가 기대하는 API wire contract입니다.
- API 세션의 리소스 ID와 작성 중인 초안만 브라우저에 보존하고, 핵심 결과와 원장은 백엔드가 관리합니다.
- 소셜 로그인·결제·외부 LLM의 운영 자격증명과 실제 사용자 데이터는 이 저장소에 포함하지 않습니다.

## 배포

GitHub Actions variable `VERCEL_ENABLED`가 `true`이고 `main`의 품질 검사가 통과하면 Vercel에 공개 프로토타입을 배포한 뒤, `PRODUCTION_URL`에 등록한 공개 alias의 HTML에서 사주리움 표식을 확인합니다. 배포를 켜기 전 저장소에 다음 GitHub Actions secrets를 등록해야 합니다.

- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

GitHub Actions variable에는 `VERCEL_ENABLED=true`와 공개 production alias를 담은 `PRODUCTION_URL`을 등록합니다. `VERCEL_ENABLED`를 설정하지 않으면 품질 검사만 실행되고 배포 job은 건너뜁니다.

이 저장소는 공개되어 있지만 현재 오픈소스 라이선스를 제공하지 않습니다.
