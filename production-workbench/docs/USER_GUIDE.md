# Production Workbench 사용 설명

GitHub Pages 링크를 Chrome 또는 Edge로 엽니다. 설치나 서버 실행은 필요 없습니다.
모든 파일은 이 PC의 브라우저에서만 처리됩니다. 탭을 닫으면 작업 상태가 사라지므로, 필요하면 작업 설정을 JSON으로 저장하세요.

화면 오른쪽 위 상태 표시:

| 표시 | 의미 |
| --- | --- |
| UNVERIFIED | 설정 중이거나 무언가 바뀌어 preflight가 필요함 |
| RUNNING | 처리 중. "Cancel operation"으로 취소 가능 |
| PREFLIGHT READY | 전체 preflight 통과. 승인 후 저장 가능 |
| BLOCKED | 예외가 있어 저장 불가 |
| DISK VERIFICATION PENDING | 다운로드 요청됨. 실제 저장 파일 검증 전 |
| PASS | 저장된 파일 전체를 다시 읽어 승인된 계획과 일치 확인 |
| ERROR / CANCELLED | 실패 또는 취소. 이전 PASS는 지워짐 |

## 1. Source & ticket

1. **Choose a DAT file**에서 원본 DAT를 고릅니다. 파일 전체를 검사하고 문서 수, 필드 수, 인코딩, SHA-256을 표시합니다.
2. **Document identity field**에서 고유 문서 ID(예: Begin Bates)를 고릅니다. 이 열은 출력에 변경 없이 남아야 합니다.
3. **Job label**, **Ticket instructions**에 이번 납품 정보를 붙여넣습니다. 티켓 문구는 참고용입니다. 프로그램이 문구를 해석해 실행하지 않습니다.
4. **Save job configuration** / **Open job configuration**: 설정을 이 PC에 JSON으로 저장하거나 불러옵니다.
   - 설정 파일에는 티켓 문구와 규칙이 들어 있으니 사건 자료와 같은 곳에 보관하세요.
   - 불러오기는 **같은 원본 DAT**(해시·헤더 일치)를 먼저 연 상태에서만 됩니다.
   - 불러온 모든 필드는 다시 확인(Confirm)해야 하고, 대상 목록 파일도 다시 골라야 합니다.
   - 형식이 잘못된 설정 파일은 통째로 거부되며 현재 작업은 바뀌지 않습니다.

## 2. Fields & Delivery Work

출력 필드 목록에서 이름, 순서, 원본 연결, 처리 규칙을 정합니다.

- **Confirm unchanged copies**: 원본과 이름이 같은 단순 복사 필드를 한 번에 확인합니다. 나머지는 하나씩 확인합니다.
- **Paste client headers**: 고객 헤더를 붙여넣어 출력 스키마를 새로 만듭니다. 새 필드는 원본 연결 전까지 "Needs review"입니다.
- **Exact mapping**: `원본 이름 [TAB] 출력 이름` 표로 연결합니다. 한 줄이라도 틀리면 아무것도 바뀌지 않습니다.
- 필드 이름을 누르면 편집기가 열립니다. **Apply & confirm this field**를 눌러야 반영됩니다. 반영하지 않은 편집이 있으면 preflight가 막힙니다.
- 편집기는 확인 시점에 규칙을 검사합니다(빠진 형식, 빈 placeholder 값, 없는 그룹 등). 오류가 있으면 확인되지 않습니다.

### Delivery Work 규칙

| 규칙 | 설정 | 주의 |
| --- | --- | --- |
| Count child documents | 부모 ID 열, Direct/All descendants, 값을 넣을 행 | 부모 ID가 원본에 없거나 순환이 있으면 차단. Bates로 관계를 추정하지 않음 |
| Custodian: last name + first name | 성 열, 이름 열 | 출력 `Last, First`. 한쪽만 비면 예외 |
| All Custodians | 원본 구분자, `원본 이름 [TAB] Last, First` 대응표 | 결과는 `;`로 연결. 쉼표는 구분자로 쓸 수 없음. 중복·공백 보존 |
| Image page count / placeholder | 페이지 수 열, placeholder 판별 열, 정확한 판별 값 | 판별 값과 정확히 같을 때만 1. 빈 페이지 수는 1로 바꾸지 않고 예외 |
| Exact value map (Item Type) | `원본 값 [TAB] 출력 값` | 대응표에 없는 값은 기본적으로 예외 |
| Exact value map + Y/N (Redacted) | `원본 값 [TAB] Y/N`, Y/N 체크 | 빈 값을 "보존"할 수 없음. 빈 값을 N으로 하려면 첫 칸이 빈 줄(`[TAB]N`)을 직접 추가 |
| Date / time format | 원본 형식, 출력 형식 | 티켓 형식은 `MM/DD/YYYY HH:mm (ticket)`. 초는 반올림 없이 버림. 시간대 변환 없음 |
| Fixed value | 값 | 예: `CONFIDENTIAL` |
| Explicit blank / Join / Validate count | 해당 설정 | 필요한 경우에만 |

- **Apply Delivery Work to**: 전체 문서 또는 특정 그룹. 그룹 범위를 고르면, 범위 밖 문서에는 "Source field" 열 값을 그대로 복사합니다.
- **Empty source values**: "Require review / block"(기본)이면 빈 값이 예외가 됩니다. 빈 값을 그대로 두려면 "Preserve blank"를 직접 고르세요. 예: 이메일이 아닌 문서의 Email Date Sent.
- **Ticket instruction supporting this rule**: 근거가 된 Notes 문구를 적어두면 Review 표와 감사 보고서에 남습니다.

## 3. Targets & scrub rules

그룹 Scrub이 필요 없으면 이 단계는 건너뜁니다.

1. **+ Add target group**, 그룹 이름 입력.
2. **Local targets**에 저장된 검색 결과(CSV 또는 DAT, 헤더 필요)를 고르고 **Target identity column**을 선택합니다.
3. Keep / Scrub 표현(예: Populate / Scrub)과 규칙 표를 붙여넣고 **Apply rule table**을 누릅니다. **Set all fields to Keep**으로 시작해 Scrub할 줄만 바꿔도 됩니다.
4. 해석된 필드별 동작을 확인하고 검토 체크박스를 체크합니다.

- 여러 그룹에 동시에 속한 문서는 모든 그룹의 규칙이 같아야 합니다. 다르면 preflight가 충돌로 차단합니다.
- 대상 ID가 원본에 없거나, 대상 목록에 중복 ID가 있으면 차단됩니다.
- 출력 필드의 **이름·순서·추가·삭제**가 바뀌면 규칙 표를 다시 적용해야 합니다(화면에 어떤 그룹인지 표시). 규칙 내용만 바꾼 경우에는 그룹 규칙이 유지됩니다.
- ID 열, 규칙 표, 대상 파일을 바꾸면 검토 체크가 자동으로 해제됩니다.

## 4. Review & preflight

1. "Processing order & exception policy"를 읽습니다.
2. 출력 필드 수와 순서를 티켓과 비교합니다. 티켓에 적힌 필드 수와 실제 목록이 다르면(예: 28 vs 31) 요청자에게 확인하세요.
3. **Run full preflight**: 원본 전체와 모든 규칙을 검사합니다.
4. 결과: 문서 수, 변경될 셀 수, 예외 수, 대상 일치 수, 그룹 밖 문서 수, Scrub할 값 수, HH:mm 변환으로 초가 버려지는 값 수, 출력에서 빠지는 원본 열, 변경 전후 예시.
5. 예외가 있으면 저장할 수 없습니다. 원본이나 규칙을 고치고 다시 실행하세요.
6. 내용을 검토했으면 승인 체크박스를 체크합니다.

## 5. Save & verify

- **Save new DAT & verify** (Chrome/Edge): 저장창에서 **새 파일 이름**을 고릅니다. 순차 저장 후 저장된 파일 전체를 다시 읽어 검증하고 PASS를 표시합니다.
  - 저장창을 닫으면 아무것도 쓰지 않고 승인 상태가 유지됩니다.
  - 기존 내용이 있는 파일은 덮어쓰지 않습니다.
  - 쓰기 실패나 취소 시 쓰던 내용은 확정되지 않습니다. 저장 확정 후 검증 전에 문제가 생기면 화면에 "Delete or quarantine it" 경고가 나옵니다. 그 파일은 납품하지 마세요.
- **다운로드 방식**(저장창 미지원 브라우저, 128 MiB 이하): 다운로드 후 상태가 DISK VERIFICATION PENDING이 됩니다. 오른쪽 **Select output DAT**에서 실제로 다운로드된 파일을 골라 **Verify against approved plan**을 눌러야 PASS가 됩니다.
- **Verify an existing output**: 이미 만든 결과 파일을 같은 원본·승인된 계획과 비교하는 독립 검증기로도 쓸 수 있습니다.
- **Save verification report**: PASS 후 감사 보고서(JSON)를 저장합니다. 원본·결과 SHA-256, 문서 수, 승인된 규칙, 티켓 문구가 들어 있으므로 사건 자료와 함께 보관하세요.

PASS는 "저장된 파일이 승인한 규칙대로 만들어졌다"는 뜻입니다. 규칙 자체가 고객 요구와 맞는지는 사람이 확인해야 합니다.

## 가상 샘플로 연습하기

`samples/` 폴더(배포 사이트의 `samples/` 경로에도 있음):

1. `sample-source.dat`를 원본으로 엽니다.
2. `sample-job.json`을 Open job configuration으로 불러옵니다.
3. 2단계에서 13개 필드를 하나씩 열어 확인합니다.
4. 3단계에서 `sample-targets.csv`를 고르고 ID 열 `BegBates`, Apply rule table, 검토 체크.
5. preflight → 승인 → 저장 → PASS. 결과는 `sample-expected-output.dat`와 같아야 합니다.

샘플의 이름·ID·날짜는 모두 가상입니다.
