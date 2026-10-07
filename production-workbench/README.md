# Production Workbench

eDiscovery 프로덕션 DAT 납품 작업을 한 화면에서 처리하는 브라우저 전용 프로그램입니다.
기존 **Field Mapper**(출력 필드 이름·순서·연결)와 **DAT Field Scrubber**(대상 문서 그룹별 Keep/Scrub)를 하나로 합치고,
production ticket Notes의 **Delivery Work** 지시를 명시적인 규칙으로 적용합니다.

- 버전: `1.0.0-rc.2` (릴리스 후보 — 아래 "검증 한계" 참고)
- 기존 `field_mapper.html`, `DAT Field Scrubber.html`은 수정하지 않고 그대로 보존합니다. 원본 해시는 [docs/legacy-baseline.json](docs/legacy-baseline.json)에 있고 보안 테스트가 매번 비교합니다.

## 사용자 실행 방법

1. 배포된 GitHub Pages 링크를 Chrome 또는 Edge에서 엽니다.
2. 끝. 설치, Python, 로컬 서버가 필요 없습니다.

`tests/preview.cjs`의 로컬 서버는 **개발자 검증용**입니다. 사용자 실행 방식이 아닙니다.

사용 순서와 화면별 설명: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

## 데이터 처리와 보안

| 항목 | 동작 |
| --- | --- |
| 업무 DAT, 티켓, 대상 목록, 파일명 | 사용자 PC의 브라우저 안에서만 읽고 처리합니다. 업로드하지 않습니다. |
| 결과 DAT, 감사 보고서, 작업 설정 JSON | 사용자가 고른 위치(저장창) 또는 다운로드로 사용자 PC에만 저장합니다. |
| 외부 AI/API, 원격 로그, 분석 도구 | 없습니다. 외부 스크립트·폰트·CDN도 쓰지 않습니다. |
| 브라우저 저장소 | localStorage, IndexedDB 등 영구 저장소를 쓰지 않습니다. 탭을 닫으면 작업 상태가 사라집니다. |
| 네트워크 차단 | 페이지 CSP `connect-src 'none'`으로 fetch, XHR, WebSocket, EventSource, sendBeacon을 차단합니다. 처리 Worker는 Blob URL로 만들어 페이지 CSP를 그대로 상속합니다. 이미지는 `data:`만 허용합니다. |

알아둘 점:

- GitHub Pages는 페이지 파일(HTML/CSS/JS)을 내려받을 때 일반적인 웹 서버 접근 기록을 남길 수 있습니다. 이 기록에는 업무 파일 내용이 들어가지 않습니다. 페이지가 열린 뒤에는 앱이 추가 요청을 보내지 않으며, 브라우저 테스트가 이를 서버 요청 기록으로 확인합니다.
- `script-src 'self'`는 같은 사이트의 스크립트 파일 로드를 허용합니다. 앱 코드는 실행 중 스크립트를 추가로 불러오지 않으며, 보안 테스트가 런타임 코드에 `importScripts`·`fetch` 등이 없는지 검사합니다.
- CSP는 `<meta>` 태그로 지정합니다. GitHub Pages는 사용자 지정 응답 헤더를 지원하지 않기 때문입니다.

## 처리 순서와 예외 정책

작업 화면 4단계(Review & preflight)의 "Processing order & exception policy"와 같은 내용입니다.

1. **읽기** — 원본 DAT를 한 레코드씩 읽습니다. 모든 출력 필드는 원본 열에서만 계산하며, 한 규칙이 다른 규칙의 결과를 읽지 않습니다.
2. **Delivery Work** — 규칙은 전체 문서 또는 선택한 그룹 소속 문서에만 적용합니다. 범위 밖 문서는 지정한 원본 열을 그대로 복사합니다.
3. **Scrub은 마지막** — 대상 그룹 문서에서 Scrub 셀은 빈 값이 되며, 그 셀은 변환·검증하지 않습니다. Keep은 Delivery Work 결과를 유지합니다. 어느 그룹에도 없는 문서는 Scrub하지 않습니다.
4. **예외가 하나라도 있으면 파일 전체 저장 차단** — 대응표에 없는 값, 허용하지 않은 빈 값, 잘못된 날짜, 정수가 아닌 페이지 수, 존재하지 않는 부모 ID는 문서별로 표시됩니다. 원본이나 규칙을 고치고 preflight를 다시 실행할 때까지 저장할 수 없습니다. 부분 결과나 "최대한 처리한" 결과는 만들지 않습니다.
5. **추측하지 않음** — 시간대 변환, 빈 값→N, 빈 페이지 수→1, Bates 번호로 관계 추정, 공백 제거·대소문자 변경을 하지 않습니다.
6. **변경하면 승인 초기화** — 원본, 대상 목록, 필드, 규칙, 그룹, 티켓 문구 중 하나라도 바꾸면 preflight, 승인, PASS, 다운로드 대기 표시가 모두 지워집니다.
7. **PASS = 저장된 파일 재검증** — 저장된 DAT 전체를 다시 읽어 원본과 승인된 계획에 맞는지 비교한 뒤에만 PASS를 표시합니다.

## 사진 속 Delivery Work 지시와 기능 대응

| Notes 지시 | 사용하는 규칙 | 사용자가 직접 지정할 것 |
| --- | --- | --- |
| Attachment Count: Number of child documents | Count child documents | 부모 ID 열, 직접 자식/전체 후손, 값을 넣을 행(모든 문서 / 최상위 문서만) |
| Custodian: Last Name, First Name | Custodian: last name + first name | 성 열, 이름 열, 빈 값 정책 |
| All Custodians: Last, First; semicolon delimited | All Custodians: map names + semicolon | 원본 구분자, 이름별 대응표 |
| Page Count: imaged 페이지 수, placeholder이면 1 | Image page count / placeholder | 페이지 수 열, placeholder 판별 열과 정확한 값 |
| Item Type: Email, Chat, Contact, Calendar Item, Note, Task, etc. | Exact value map | 원본 값→유형 대응표 |
| 날짜 4종: MM/DD/YYYY HH:MM, 24시간제 | Date / time format | 원본 날짜 형식, 출력 형식 `MM/DD/YYYY HH:mm (ticket)` |
| Confidentiality: CONFIDENTIAL | Fixed value | 값 `CONFIDENTIAL` |
| Redacted: Y/N | Exact value map + Y/N 강제 | 원본 값→Y/N 대응표 |

- 날짜 출력 `HH:mm`은 초를 **버립니다(반올림하지 않음)**. preflight가 초가 버려지는 값의 수를 필드별로 보여줍니다. 원본에 초가 없으면 `HH:mm:ss` 출력은 거부합니다(초를 만들어내지 않음).
- 사진 상단의 "28 fields"와 실제 목록 31개가 다릅니다. 프로그램은 필드 수를 자동 확정하지 않습니다. Review 화면의 출력 필드 수와 순서를 티켓 요청자에게 확인하세요.
- 사진에 없는 경로 수정·Bates 가공 기능은 추가하지 않았습니다.

## 파일 구성

| 경로 | 내용 |
| --- | --- |
| `index.html`, `styles.css` | 5단계 작업 화면 |
| `js/io.js` | 스트리밍 DAT/CSV 입출력, 인코딩·BOM·줄바꿈 보존, SHA-256 (기존 Scrubber에서 추출) |
| `js/core.js` | 규칙 엔진, 필드 검증, preflight, 변환, 저장 파일 재검증 |
| `js/worker.js` | 백그라운드 처리, 1 MiB 단위 출력 청크와 역압(backpressure) |
| `js/app.js` | 화면 연결, 상태 무효화, 저장·다운로드·재검증, 설정 저장/가져오기 |
| `samples/` | **가상** 샘플(원본 DAT, 대상 CSV, 작업 설정, 기대 결과). 실제 데이터 아님 |
| `tests/` | 개발자 테스트와 샘플 생성 스크립트 |
| `docs/` | 사용 설명, 테스트 결과, 기존 파일 기준 해시 |

## 제한 사항

- 문서 수·대상 ID 최대 1,000,000건, 필드 최대 2,000개, 레코드 최대 32 Mi 문자.
- 입력 인코딩: UTF-8(BOM 유무), UTF-16 LE/BE(BOM 필수). 원본 인코딩·BOM·줄바꿈을 그대로 유지해 저장합니다.
- 메모리: 파일은 1 MiB씩 순차 처리합니다. 다만 문서 ID 목록, 그룹 소속, 부모 관계는 메모리에 유지하므로 수십만 건 이상에서는 수백 MB가 필요할 수 있습니다.
- 스트리밍 저장(대용량 권장)은 Chrome/Edge의 저장창(File System Access API)을 씁니다. 지원하지 않는 브라우저는 128 MiB 이하에서만 다운로드 방식으로 저장하며, 이 경우 다운로드된 실제 파일을 다시 선택해 검증해야 PASS가 됩니다.
- 저장창에서 기존 파일을 고르고 "바꾸기"를 승인하면 브라우저가 앱보다 먼저 그 파일을 비울 수 있습니다. 항상 새 파일 이름을 쓰세요.

## 개발자 테스트

Node.js가 필요합니다(개발자 PC만). 결과와 검증 한계: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)

```bash
node --test tests/core.test.cjs tests/security.test.cjs
```

```bash
node tests/browser.test.cjs
```

브라우저 테스트는 Playwright와 Chrome이 필요합니다. `PLAYWRIGHT_MODULE`로 기존 Playwright 설치 경로를, `CHROME_PATH`로 Chrome 경로를 지정할 수 있습니다. 산출물은 `test-results/`(Git 제외)에 저장됩니다.

샘플 재생성: `node tests/make-samples.cjs`

## GitHub Pages 배포

이 폴더는 기존 저장소 [phlee219/eDiscovery](https://github.com/phlee219/eDiscovery)의 `production-workbench/` 하위 폴더로 올립니다.
저장소의 Pages가 "Deploy from a branch → `main` / root"로 켜져 있으므로 별도 설정 없이 push하면 배포됩니다.

- 사용 주소: `https://phlee219.github.io/eDiscovery/production-workbench/`
- 저장소 최상위의 기존 도구(`field_mapper.html` 등)는 건드리지 않습니다.
- 브랜치 배포라 `tests/`, `docs/`, `samples/`도 공개됩니다. 모두 가상 데이터만 있습니다.
- 웹의 "Upload files"는 `.gitignore`를 적용하지 않습니다. `git add production-workbench` 후 `git status`로 목록을 확인하고 올리세요.
- 저장소 안에서는 상위 폴더에 별도 버전의 HTML이 있으므로 기존 파일 해시 검사는 건너뜁니다. 로컬 기준을 검사하려면 `LEGACY_DIR=C:\Coding\Tools`를 지정해 실행합니다.

배포 후 Pages 주소를 Chrome과 Edge에서 열어 [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)의 "배포 후 수동 확인" 항목을 진행합니다.
