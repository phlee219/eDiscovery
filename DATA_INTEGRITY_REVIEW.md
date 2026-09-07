# 데이터 무결성 검토 — 2026-09-06

대상: `field_mapper.html`, 내부 버전 `2.18.5`, build `2026-09-06-h7` (Release Candidate).
운영 파일명은 고정한다. 원본 DAT 데이터는 변경하지 않았다.

## 결론

기존 strict FE/DC4 정책은 유효했지만, 읽기·저장·검증 사이에 남아 있던 무결성 결함을 수정했다. 특히 잘못된 UTF-16을 정상 문자로 대체한 뒤 비교하는 경로와, 동일 크기 바이트 손상을 자동 저장 검사에서 놓치는 경로를 차단했다. 이 결과는 소프트웨어 검토 및 아래 자동 테스트의 범위에 해당하며, 모든 환경에서 무오류로 동작한다는 보증은 아니다.

## 발견 및 수정

아래 표와 첫 실행 결과는 h2 검토 기록이다. h3 추가 검토 및 최종 결과는 문서 끝에 기록했다.

| 위험 | 기존 동작 / 영향 | 수정 |
|---|---|---|
| 높음: UTF-16 손상에 대한 잘못된 PASS | 저장 전 별도 surrogate 검사는 있었지만 수동 Validator의 UTF-16 디코더는 손상된 code unit을 U+FFFD로 대체했다. 서로 다른 원시 문자가 같은 대체 문자로 비교될 수 있었다. | 공통 스트리밍 디코더를 UTF-16에도 fatal 모드로 적용. 정상 surrogate pair는 청크 경계를 넘어도 보존. |
| 높음: 저장된 바이트 손상 미검출 | 즉시 검사는 크기와 헤더 중심이고 저장 해시 생성은 감사 보고서 체크박스에 종속됐다. 헤더 뒤의 동일 길이 손상을 저장 성공으로 표시할 수 있었다. | 감사 선택과 무관하게 해시 생성. 저장 후 파일 전체를 다시 읽어 SHA-256 비교. 불일치 시 저장 상태·감사 보고서를 OUTPUT UNUSABLE로 처리. |
| 높음: 대상 파일 확인 실패 시 쓰기 진행 | 대상 파일의 getFile 오류를 무시해 파일이 비어 있는지 확인하지 못한 상태에서도 createWritable에 도달했다. | 읽기 실패를 전파하여 쓰기 시작 차단. 기존 non-empty 대상 차단 유지. |
| 높음: 검증 정지 / 남아 있는 작업 | 헤더 이전 EOF·읽기 오류에서 EOF 표식을 헤더로 소비한 뒤 다시 기다릴 수 있었다. 소비자 오류 시 생산자가 큐에서 대기한 채 남았다. | 공유 취소 상태와 모든 대기자의 종료 처리. 생산자 완료를 기다리며 오류 전파. 실제 읽은 헤더도 분석 시 헤더와 비교. |
| 높음: 저장 마지막 단계의 구조 이상 | 두 번째 읽기의 불완전 qualifier / UTF-16 결과를 버리고, 레코드 수 비교는 close 이후에 했다. | 쓰기 패스 결과와 레코드 수를 close 이전에 검사. 각 행의 필드 수도 다시 검사하여 padding/truncation 방지. |
| 중간: 검사 과정의 BOM 유실 | 선언된 BOM을 건너뛴 다음 TextDecoder 기본 BOM 제거가 다시 적용되어 두 번째 U+FEFF가 숨겨질 수 있었다. | 스트리밍 디코더에서 ignoreBOM=true. 선언된 BOM 뒤의 U+FEFF는 실제 내용으로 처리. |
| 중간: 저장 및 검증 상태 혼용 | 저장 사이 await에서 매핑 UI를 변경할 여지가 있었다. 수동 검증에 이전 저장 해시가 적용됐다. 취소된 옛 검증의 catch가 새 상태를 덮어쓸 수 있었다. | 저장 동안 main/topbar를 inert 처리하고 완료·실패 시 복구. 현재 저장 파일 쌍에만 저장 해시 적용. 오래된 결과 게시 차단, 새 검증 시작 시 이전 PASS 제거. |
| 중간: 큰 헤더 오탐 / 읽기 실패 무시 | 헤더 1MiB 고정 샘플에서 잘린 헤더를 불일치로 판단하거나 읽기 오류를 non-blocking으로 넘겼다. | 첫 레코드를 스트리밍으로 읽고 실제 헤더 비교. 읽기 불가·빈 출력은 실패. |
| 중간: 출력 크기 증폭 | client 1:N 필드 재사용으로 입력보다 출력이 커질 수 있었다. Blob 제한은 입력 크기 기준이었다. | 출력 레코드에도 64Mi UTF-16 code-unit 상한 적용. Blob 누적 출력 자체에 512MiB 제한. |
| 중간: 낡은 테스트·설명 | 기본 테스트는 존재하지 않는 `field_mapper.html`을 읽었고, 예전 relaxed 정책(legacy FE/멀티라인/short-row padding)을 기대했다. README도 v2.17 기준이었다. | 실제 배송 HTML을 대상으로 strict 정책의 테스트와 운영 문서 교체. |

## 실행한 검증

환경: Windows, Node.js v24.19.0. 별도 패키지 의존성 없음.

- `node tests/run_core_tests.mjs`: **15개 그룹 통과**. 5,000개 결정적 무작위 Unicode 왕복 사례 포함.
- `node tests/run_dom_flow.mjs`: **14개 그룹 통과**. HTML 전체 스크립트 초기화와 시작 자체 검사, 실제 저장 함수 두 종류, 파일 재읽기 및 Validator 검사 실행.
- UTF-8 / UTF-16 LE / BE × BOM 유무 × CRLF/LF/CR × 마지막 줄바꿈 유무: 36개 조합에서 값과 전체 바이트 왕복 확인.
- SHA-256을 Node crypto 구현과 비교: 패딩 경계 및 8MiB를 넘는 데이터 포함.
- 잘못된 Unicode, 중복 BOM, 짧거나 긴 행, 열린 qualifier, mixed EOL, 읽기 실패, 저장 실패, 동일 크기 손상, 큰 헤더, 출력 증폭, 이전 해시 상태 등을 검사.
- 작업 폴더의 `saltvpepper.dat` 읽기 확인: UTF-8, FE/DC4, 28개 필드, 688개 데이터 행. 파싱 오류 0, 필드 수 불일치 0, mixed EOL 없음. 원본은 수정하지 않음.

DOM 테스트의 File System Access와 DOM은 **모의 구현**이다. OS 파일 선택창, 실제 브라우저의 권한 처리, 디스크 장애 및 강제 종료 복구를 직접 실행한 테스트는 아니다. 실제 브라우저 최종 확인 절차는 README 참조.

## 남는 운영상 경계

- 저장 직후 SHA-256 일치는 “저장 코드가 생성한 바이트가 다시 읽은 바이트와 같다”는 뜻이다. 매핑 자체가 업무상 올바르다는 증거는 아니다. 납품 전 승인된 매핑 및 identity로 Validator를 실행해야 한다.
- 자동 매핑의 이름 정규화는 업무 의미를 판단하지 못한다. 중요한 필드의 원본 열 번호와 실제 의미는 사람이 확인해야 한다.
- identity 중복·공백 검사는 기존대로 참고 결과다. 중복 검사는 500,000개 distinct 값에서 중단되므로 전체 유일성 보증이 아니다. 승인된 고유 identity를 사용하고 대규모 데이터의 유일성은 별도 절차로 확인한다.
- Blob 다운로드는 메모리 내용만 다시 읽는다. 실제 다운로드된 디스크 파일은 Validator에서 직접 선택해야 한다.
- 저장 성공 후 외부 프로그램이 파일을 수정하는 것까지 방지하지는 않는다. 최종 납품 파일의 검증 결과와 해시를 함께 보관한다.
- 출력 전체 재읽기 때문에 큰 파일은 디스크 읽기 한 번이 추가된다. Blob 경로는 브라우저 메모리 한계로 512MiB 이전에도 실패할 수 있으므로 큰 파일은 스트리밍 저장을 사용한다.
- 검사 실패가 close 이후 발견되면 이미 생성된 파일이 남을 수 있다. 파일을 자동 삭제하지 않고 사용 금지로 표시한다. 해당 출력을 전달하지 않는다.

## 추가 검토 및 최종 결과 — h3

새 규칙에 맞춰 읽기→분석→저장→검증 간 연결과 붙여넣기 매핑 경계를 추가 검토했다.

| 확인한 위험 | 수정과 검증 |
|---|---|
| 분석 후 파일 바이트 변경 | 분석 패스에 전체 SHA-256을 추가하고 commit 이전의 원본 해시와 비교한다. 제거된 열만 같은 길이로 변경한 사례에서도 저장을 차단하는 회귀 테스트를 추가했다. 일반 브라우저 File은 외부 변경 시 읽기 오류를 낼 수 있으므로, 이 사례는 교체 가능한 provider를 이용한 방어적 fault injection이다. |
| 원본·출력 모두 분석 후 변경되면 같은 값을 비교해 PASS 가능 | Validator가 두 파일의 분석 해시와 재읽기 해시를 각각 비교한다. 양쪽 내용이 동시에 바뀌어도 이전 분석에 대한 PASS를 내지 않는다. |
| 오래된 저장 File snapshot 사용 | 1-Click 검증에서 저장 handle로 현재 디스크 파일을 새로 얻는다. 현재 열 이름과 저장 시 열 이름도 대조한다. 이전 snapshot이 계속 읽히고 handle이 변경된 파일을 반환하는 사례를 검사했다. |
| 마지막 EOL 읽기 실패를 무시 | 별도 tail probe를 제거했다. full streaming scan에서 마지막 문자와 EOL 상태를 산출하며, BOM 또한 재구성한 바이트 대신 실제 파일에서 확인·해시한다. |
| 재분석·겹치는 로드가 상태 혼합 | 재분석을 공통 loader로 통합하고 모든 진입점에서 이전 원본을 무효화한다. load token과 parsing 상태로 오래된 결과가 새 파일을 덮어쓰지 못하게 한다. |
| 붙여넣은 표 일부를 버리거나 필드명을 표 제목으로 오인 | 여러 행의 매핑은 두 열로 제한하고 빈 출력명·불균일한 너비를 차단한다. 명확한 제목 조합만 제거한다. Validator의 한 행짜리 이름 변경 매핑도 올바르게 해석한다. |
| 오류가 toast 이후 사라지거나 보고서가 과도한 메모리 사용 | 화면에 오류 요약을 유지하고 로컬 JSON 다운로드를 추가했다. 최신 100개 오류, 전체 오류 수, 생략 수를 기록하며 메시지·비교 샘플 크기를 제한한다. 알 수 없는 record ID/위치는 null로 남긴다. |
| picker/preflight/close/reopen 오류 이후 상태 혼동 | picker 실패 시 암묵적 Blob 다운로드를 중단하고, preflight 오류에서도 busy/inert 상태를 복구한다. close·재읽기 실패는 사용 가능한 저장 상태가 되지 못한다. |

최종 자동 검증: **core 17개 그룹 + DOM/저장/Validator 통합 25개 그룹, 합계 42개 그룹 통과**. 기존 Unicode 무작위 왕복 5,000건과 36개 인코딩/BOM/EOL 조합을 포함한다. 인코딩 조합에서는 분석 해시도 Node crypto와 대조하고 마지막 EOL 상태를 확인했다.

고객에게 소프트웨어를 전달할 때 사용할 파일은 위 대상 HTML이며, 사용 지침은 README다. 실제 브라우저 확인도 시도했으나 자동화 환경의 URL 정책이 로컬 HTML 열기를 차단했다. 우회하지 않았으며, 실제 브라우저·OS 파일 선택창·물리 디스크 장애·대규모 운영 데이터에 대한 인수 검증은 미완료다. 따라서 현재 결과를 무조건적인 고객 운영 승인이나 무오류 보증으로 해석하지 않는다.

## v2.18.2/h4 검토 기록 — 운영 파일명 고정 및 대용량·검증 상태 강화

대상: `field_mapper.html`, 내부 버전 `2.18.2`, build `2026-09-06-h4`. 운영 파일명을 고정하고 내부 버전만 올리는 정책으로 전환했다. 이전 문서와 테스트 하네스는 존재하지 않는 `field_mapper_v2.18.1_hardened.html`을 참조해 현재 전달 파일에 대한 재현이 불가능했으며, 이는 릴리스 차단급 패키징 불일치로 판단해 수정했다.

| 확인한 위험 | 수정 |
|---|---|
| 파일명·문서·테스트 경로 불일치 (릴리스 차단) | README/DATA_INTEGRITY_REVIEW/두 테스트 하네스가 모두 실제 `field_mapper.html`을 참조하도록 일치. 내부 버전만 2.18.2/h4 |
| 극단적으로 많은 열을 가진 레코드가 split·배열·DOM에서 메모리 고갈 | v2.18.2에서 상한을 도입했고 v2.18.3에서 운영/UI 안전성을 위해 레코드당 2,000열(`MAX_FIELD_COUNT`)로 낮춤. `split()` 이전 bounded 스캔 및 `feCompose`에 동일 적용 |
| 행마다 서로 다른 필드 수를 가진 대용량 파일에서 히스토그램 Map 무한 증가 | 폭 상세 256개(`MAX_TRACKED_WIDTHS`)로 제한. 매칭/불일치/short/long 총계와 최초 불일치 위치는 정확 |
| 붙여넣은 고객 헤더의 묵시적 trim | 과거에 출력 헤더를 조용히 trim → 셀 원문 보존. T1 Exact는 whitespace/대소문자까지 exact이며, fold 매칭은 명시적 T2로 한정 |
| Validator 상태 미구분/차단 상태가 RUNNING처럼 보임 | `UNVERIFIED/RUNNING/BLOCKED/CANCELLED/FAIL/ERROR` 상태 머신 도입. 시작 시 사전 검증으로 BLOCKED 즉시 표시, stale PASS는 항상 무효화 |
| identity 자동 선택이 output 열 index를 사용 | 첫 매핑된 SOURCE index를 선택하도록 수정 (mapping=[8,2,5] 회귀 테스트 추가) |
| 낡은 Validator 로드가 새 로드의 busy overlay를 지움 | `valLoadSide` finally를 owner token으로 가드 |
| 저장 abort/cleanup/reopen 실패 무시 | 기록·구조화 오류·toast로 보고. 무결성 경로의 빈 catch 제거 |
| 브라우저 보증 문구 과장 | 감사 보고서에 FSA에는 fsync/atomic-replace가 없음을 명시하고 disk 재-read만 주장 |
| 로컬 전용이 코드 규약에만 존재 | `connect-src 'none'` 등 local-only CSP meta 추가. 테스트에 외부 리소스/네트워크 API 금지 정적 검증 추가 |
| 과거 relaxed/cleansing 정책 문구 잔존 | Validator 설명·주석·죽은 `CP1252_TO_UNICODE` 제거. strict 정책("자동 승인 없음")으로 통일 |
| 픽스처가 strict 정책과 모순 | `tests/fixtures.mjs`를 strict 규칙에 맞게 재작성하고 `tests/strict_fixture_tests.mjs` 드라이버로 실행 (legacy FE·내장 LF를 'good'으로 오기재한 항목 제거) |

자동 검증(Node v24.19.0, 로컬 런타임 사용, 프로젝트 외부 전송 없음): **core 20그룹 + strict fixture 4그룹, DOM/저장/Validator 통합 30그룹 — 총 54그룹, 실패 0**. 신규 회귀에는 열 수 상한, bounded 히스토그램 정확성, whitespace 보존 헤더/정확 T1, identity fallback 수정, BLOCKED 상태, cleanup 실패 기록, local-only 정적 검사가 포함된다.

여전히 mock이 아닌 항목: 실제 브라우저/OS 파일 선택창, 물리 디스크 장애·강제 종료, 대규모 운영 데이터, 목표 환경에서의 CSP 동작. 해당 인수 검증 전까지 무조건적인 고객 운영 승인으로 해석하지 않는다.

## v2.18.3/h5 추가 검토 — 실제 취소와 운영자 승인

파일명은 `field_mapper.html`로 고정하고 내부 버전만 2.18.3/h5로 올렸다.

| 위험 | 수정 및 검증 |
|---|---|
| 검증 중 설정 변경 시 `validationActive`가 영구 true로 남을 수 있음 | operation 객체/finally ownership으로 취소·supersede 후 항상 lock 해제. 깨끗한 재실행 회귀 테스트 추가 |
| CANCELLED 상태가 선언뿐이고 실제 I/O 취소가 없음 | Cancel 버튼, cancellation signal, `scanFile` chunk 검사, pair producer/consumer wake hook 구현. 취소 시 report 없음/CANCELLED/재실행 가능 |
| 자동 제안 identity가 승인된 identity처럼 사용됨 | suggestion과 approval 분리. operator approval checkbox 필수, 변경 시 무효화, 보고서에 승인 상태/UTC 기록 |
| T2 normalized mapping이 검토 없이 저장/PASS 가능 | client save와 Validator 모두 T2 승인 필수. mapping 변경 시 승인 무효화. tier provenance를 Validator mapping/report에 보존 |
| 1-Click이 identity를 자동 선택하고 검증 자동 실행 | 실제 저장 handle 파일과 mapping만 준비. 사용자 review/identity 승인/Validate 클릭 전 실행하지 않음 |
| 붙여넣기 parser가 blank row/trailing blank/extra empty Excel 열 삭제 | 내부 blank row, blank header, trailing blank, 2열 초과를 위치 포함 오류로 차단. 2Mi UTF-16 unit 및 2,000행/열 사전 상한 |
| Validator vertical fallback이 다시 trim | parsed 원문을 재사용해 whitespace 보존 |
| source/output 동시 load 중 먼저 끝난 쪽이 busy overlay 제거 | 글로벌 busy owner Set으로 모든 active owner 종료 전까지 overlay 유지 |
| 10,000열 DOM이 실브라우저를 압박 | 운영 상한을 2,000열로 낮춤. 상한은 `split()` 이전 적용 |

자동 검증(Node v24.19.0): **core 20 + strict fixture 4 + DOM/save/Validator 38 = 총 62그룹, 실패 0**. DOM harness는 File System Access/DOM mock이며 실제 Chrome/Edge 인수는 여전히 별도 필요하다.

## v2.18.4/h6 최종 집중 감사 — Release Candidate 동결

사용자 모르게 발생할 수 있는 데이터 오류/false PASS만 재검토했다. pasted Validator map이 normalized source-name resolution도 모두 `manual`로 표시하고, map에서 빠진 output column을 같은 이름으로 암묵 보완하던 마지막 false-confidence 경로를 수정했다.

- exact source name: `manual-exact`
- normalized source name: `T2` (명시적 승인 필수)
- pasted map에서 누락된 output column: unresolved (자동 보완 없음)
- 중복/모호 source name: unresolved

최종 자동 검증(Node v24.19.0): **core 20 + strict fixture 4 + DOM/save/Validator 39 = 총 63그룹, 실패 0**. 현재 알려진 silent data corruption/false PASS 결함은 테스트 및 코드 검토 범위에서 발견되지 않았다. 이후 비치명적 예외·UX는 실제 사용 피드백으로 처리하고 이 버전을 RC로 동결한다.

## v2.18.5/h7 메타데이터 정합성

상단 bilingual owner watermark 변경을 정식 내부 버전으로 반영했다. 실행 코드·문서·테스트 fixture를 2.18.5/h7로 통일했으며 DAT 변환 계약 변경은 없다. 상단 HTML 주석과 `TOOL_VERSION` 불일치가 재발하면 bootstrap 테스트가 실패한다.
