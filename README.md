# Sajurium Client

사주리움의 공개 웹 클라이언트 저장소입니다. Next.js 16과 React 19를 사용하며, 패키지 관리는 Bun 1.3.14를 기준으로 합니다.

현재 구현과 production 배포는 제품 흐름과 화면 상태를 검증하기 위한 공개 인터랙티브 프로토타입입니다. 실제 사주 계산, 계정, 서버 저장, 결제, 상담, 알림 발송에는 연결되어 있지 않습니다.

## 로컬 실행

```bash
bunx bun@1.3.14 install --frozen-lockfile
bunx bun@1.3.14 run dev
```

기본 개발 서버는 `http://localhost:3000`에서 실행됩니다. 포트를 바꾸려면 `bunx bun@1.3.14 run dev -- --port 3001`처럼 실행합니다.

## 검증

```bash
bunx bun@1.3.14 run test:quality
```

이 명령은 OpenAPI 생성물 드리프트, lint, TypeScript, 단위 테스트, production build, Playwright E2E를 차례로 검사합니다.

## 저장소 경계

- `openapi/sajurium.yaml`은 클라이언트가 기대하는 API wire contract입니다.
- 화면은 현재 fixture와 브라우저 저장소를 사용합니다.
- 백엔드 구현, 운영 자격증명, 실제 사용자 데이터는 이 저장소에 포함하지 않습니다.

## 배포

GitHub Actions variable `VERCEL_ENABLED`가 `true`이고 `main`의 품질 검사가 통과하면 Vercel에 공개 프로토타입을 배포한 뒤, `PRODUCTION_URL`에 등록한 공개 alias의 HTML에서 사주리움 표식을 확인합니다. 배포를 켜기 전 저장소에 다음 GitHub Actions secrets를 등록해야 합니다.

- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

GitHub Actions variable에는 `VERCEL_ENABLED=true`와 공개 production alias를 담은 `PRODUCTION_URL`을 등록합니다. `VERCEL_ENABLED`를 설정하지 않으면 품질 검사만 실행되고 배포 job은 건너뜁니다.

이 저장소는 공개되어 있지만 현재 오픈소스 라이선스를 제공하지 않습니다.
