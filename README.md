# Gaia

Electron + Svelte 기반의 협업 지도 작성 툴입니다. 무한히 확장 가능한 사분트리(Quadtree) 지형 위에 영역을 정의하고, 여러 사용자가 WebSocket으로 동시에 작업할 수 있도록 설계되었습니다.

## 주요 기능
- **실시간 협업 편집**: `ws://localhost:48829` WebSocket 서버를 통해 여러 사용자가 동일한 지도를 공유
- **사분트리 기반 렌더링**: `dataframe.js`에 구현된 `Quadtree` 구조로 대규모 맵을 효율적으로 저장 및 조회
- **다양한 드로잉 도구**: 선택, 패닝, 선/사각형/폴리곤 드로잉, 브러시, 이미지 스탬프, 채우기 등 Svelte UI에서 제공
- **레이어 & 영역 관리**: 영역 이름/색상 변경, 레이어 추가·삭제·정렬, 부분 로드 등 세밀한 제어
- **파일 지속성**: `map.gaia` 파일로 저장하며 서버 재시작 시 자동 로드

## 빠른 시작
### 요구 사항
- Node.js 18 이상 (LTS 권장)
- npm
- Git (저장소 클론 시 필요)

### 설치
```bash
git clone https://github.com/junhg0211/gaia.git
cd gaia
npm install
```

### 개발 모드
- 전체 개발 환경: `npm run dev` (Vite + Electron 동시 실행)
- UI 단독 실행: `npm run dev:ui`
- Electron 단독 실행: `npm run dev:electron`
- Windows용 동시 실행 스크립트: `npm run dev:windows`

> 개발 모드에서는 Electron이 `http://127.0.0.1:5174`의 Vite dev server를 로드하므로, 해당 포트가 사용 중이면 먼저 해제해야 합니다.

### 프로덕션 실행 및 빌드
- 배포판 다운로드: GitHub Releases에서 운영체제에 맞는 패키지를 내려받아 바로 실행할 수 있습니다.
- 프로덕션 실행: `npm run start`
- 프로덕션 실행 (Windows): `npm run start:windows`
- 렌더러만 빌드: `npm run build:ui`
- 전체 패키징: `npm run build` → `dist/` 아래에 플랫폼별 바이너리 생성 (electron-builder 사용)

### 테스트
사분트리 및 맵 직렬화 로직 테스트는 Node 내장 `assert`로 이루어져 있습니다.
```bash
npm run test:dataframe
```

## 프로젝트 구조
- `index.js`: Electron 메인 프로세스. 앱 창을 생성하고 개발/프로덕션 모드를 전환
- `ws-server.js`: WebSocket 서버와 맵 동기화 로직, 하트비트 관리, 명령 처리
- `dataframe.js`: 맵/레이어/영역/사분트리 자료구조와 직렬화·역직렬화 유틸리티
- `dataframe-fs.js`: `map.gaia` 파일 입출력 래퍼
- `renderer/`: Svelte 기반 렌더러 소스 (`App.svelte`, `Map.svelte`, `canvasController.js`, `websocketManager.js` 등)
  - `renderer/dist/`: Vite 빌드 아티팩트 (자동 생성)
- `assets/`: 앱 아이콘 및 배포 리소스
- `dist/`: electron-builder 결과물 (생성 후 존재)

## WebSocket 동작 개요
- 서버 주소: `ws://localhost:48829`
- 기본 로그인 메시지: `LOGIN:secret:<username>` (클라이언트에서 자동 전송)
- 지도 전체 요청: `LOADC` (Compact 포맷) 또는 `LOAD`
- 편집 명령: `LINE:`, `RECT:`, `POLY:`, `FILL:` 등의 프리픽스로 인코딩됨 (자세한 구현은 `renderer/websocketManager.js`, `ws-server.js` 참고)
- `SAVE` 명령으로 서버에 현재 맵을 `map.gaia`로 저장

## 개발 팁
- Renderer가 응답하지 않을 때는 Vite 서버(`npm run dev:ui`)가 정상 기동 중인지 확인하세요.
- WebSocket 연결이 끊기면 `App.svelte` UI의 재연결 버튼으로 세션을 복구할 수 있습니다.
- 새 명령을 추가할 때는 `ws-server.js`와 `renderer/websocketManager.js`의 파서가 동기화되어야 합니다.

## 배포 참고사항
- electron-builder 설정은 `package.json`의 `build` 섹션에 있으며 macOS, Windows, Linux 타깃이 정의되어 있습니다.
- 빌드 과정에서 `map.gaia` 샘플 데이터가 `resources/example-data/map.gaia`로 포함됩니다.

## 테스트 및 품질 관리 체크리스트
- `npm run test:dataframe` 실행
- 변경된 WebSocket 메시지 포맷이 있으면 클라이언트/서버 양쪽 테스트 및 수동 확인
- UI 변경 시 렌더러 스크린샷 혹은 스크린 레코딩 준비

## 라이선스
이 프로젝트는 MIT License 하에 배포됩니다. 자세한 조건은 `LICENSE` 파일을 참고하세요.
