LOAD-FILE EDITOR & EXAMINER · DEVELOPER GUIDE

# LEE를 설명하고, 코드에서 원인을 찾는 법

메뉴를 아는 수준에서 한 단계 더 나아가, 데이터가 어디에서 읽히고 어떻게 바뀌며 무엇을 검증하는지 이해하기 위한 안내서입니다. 핵심 용어와 실무 설명 문장을 영어로 함께 적어, 영어 질문과 설명에도 활용할 수 있게 했습니다.

한국어 + English · 개발자 / Delivery Engineer

배포 파일 확인: 3.1.6

읽은 소스의 버전 표시: 3.1.7

2026-10-14 · 미동부 기준

- [다른 사람에게는 이렇게 설명하면 됩니다 · Product overview](#overview)
- [무슨 언어로 만들었고 어떻게 실행되나요? · Technology and startup](#stack)
- [파일 하나가 결과물로 바뀌는 전체 과정 · Data flow and indexing](#architecture)
- [master, view, DataSetView만 이해해도 절반은 읽힙니다 · Data views and edit history](#views)
- [자주 쓰는 기능을 엔진 관점으로 보기 · Core workflows](#workflows)
- [“검증됨”이 정확히 무슨 뜻인지 설명하기 · Validation and evidence](#integrity)
- [문제가 나면 어느 파일을 볼까요? · Code map](#source-map)
- [코드에서 원인을 찾는 5단계 · Troubleshooting](#debug)
- [동료나 고객이 물으면 어떻게 답하나요? · Questions and answers](#questions)
- [설계 목표, 코드 한계, 실제 시험을 분리하기 · Limits and measured scale](#limits)
- [계획과 개발 이력을 읽는 순서 · Development and release workflow](#plan)
- [어디까지 공부하면 질문에 대답할 수 있나요? · Learning path and terminology](#learning)

<a id="overview"></a>

## 다른 사람에게는 이렇게 설명하면 됩니다 · Product overview

> **In English**
>
> LEE is a local Windows tool for examining and editing eDiscovery load files. It compares records by exact document ID, updates metadata, runs production QC, and exports new files. It uses disk-based indexes for large load files and verifies generated output and the actual saved file.

> LEE는 eDiscovery 로드파일을 로컬에서 읽고, 문서 ID 기준 비교·메타데이터 수정·납품 QC·새 파일 내보내기를 수행하는 Windows 도구입니다. 큰 파일 전체를 표로 메모리에 올리는 대신 원본 위치를 인덱싱하고, 처리 결과와 실제 저장된 파일을 검증합니다.

Relativity나 Nuix 자체를 대체하는 처리·리뷰 플랫폼은 아닙니다. 그 플랫폼에 올리기 전이나 납품 전에 **로드파일과 관련 파일의 문제를 찾고, 지정한 변경을 수행하고, 근거가 남는 결과물을 만드는 도구**로 설명하는 것이 정확합니다.

### 업무 관점

“Original과 Updated가 어디서 다른가?”, “누락된 native/text/image가 있는가?”, “특정 필드만 안전하게 바꿀 수 있는가?”, “고객에게 줄 파일을 올바르게 만들었는가?”에 답합니다.

### 개발 관점

파일 파서, 디스크 인덱스, 데이터 뷰, 작업 엔진, 검증·출력 엔진 위에 WinForms 화면을 얹은 구조입니다. 기능 대부분이 같은 데이터 접근 규약을 공유합니다.

### 이 문서의 기준

현재 로컬 `LEE.exe`와 `LEE.html`은 파일 버전 **3.1.6.0**이며 SHA-256이 같습니다. 읽은 개발 소스의 `WorkspaceEngine.Version`에는 **3.1.7**이 적혀 있습니다. 소스의 번호만으로 3.1.7이 배포됐다고 판단하면 안 됩니다.

확인한 배포본 SHA-256:
3818581610EFF248FCC76BF07F335771EF540EA4976B3554D7646153B672E52A

이번 작업은 읽기와 안내서 작성입니다. 프로그램 소스·버전·설정·체크포인트를 수정하거나 빌드·제품 테스트·배포하지 않았습니다. 코드 위치는 조사 당시 기준이며, 이후 다른 AI의 변경으로 달라질 수 있습니다.

<a id="stack"></a>

## 무슨 언어로 만들었고 어떻게 실행되나요? · Technology and startup

> **In English**
>
> LEE is written in C# with a Windows Forms interface and targets .NET Framework 4.5. The current LEE.html product download contains the same executable bytes as LEE.exe; it is not a browser application.

| 항목 | 현재 구성 | 개발자로서 알아둘 의미 |
| --- | --- | --- |
| 주요 언어 | C# · 프로젝트 `LangVersion 14.0` | 클래스, 메서드, 이벤트, 예외, 람다, `using`을 읽을 수 있으면 핵심 흐름을 따라갈 수 있습니다. |
| 화면 | Windows Forms / WinForms | `Form`, `Button`, `DataGridView`, `ComboBox` 같은 Windows 컨트롤을 사용합니다. 웹 UI가 아닙니다. |
| 실행 환경 | .NET Framework 4.5 대상 · `net45` | C# 14는 컴파일러가 이해하는 문법이고, net45는 실행 API의 대상입니다. 문법 버전이 높아도 최신 .NET API를 모두 쓸 수 있다는 뜻은 아닙니다. |
| 프로세스 설정 | `WinExe`, `Prefer32Bit=true` | 32비트 선호 설정입니다. 대용량 데이터를 RAM에 모두 올리지 않는 설계가 특히 중요합니다. 이를 “64비트 대용량 엔진”이라고 설명하지 마십시오. |
| 오래된 이름 | `eDML` 네임스페이스·클래스·일부 폼 | LEE로 이름을 바꾼 뒤에도 내부 이름을 유지합니다. 현재 프로그램 이름과 코드 안의 이름이 다를 수 있습니다. |
| 시작 부분 | `eDML.My/MyApplication.cs` | C# 코드에서 Visual Basic의 WindowsFormsApplicationBase를 사용합니다. 기존 애플리케이션 구조의 흔적입니다. 전체가 VB 프로그램이라는 뜻은 아닙니다. |
| XLSX | ZIP + XML 직접 스트리밍 작성 | 핵심 XLSX 내보내기는 Excel을 자동 조작하지 않고 파일 구조를 직접 씁니다. 셀 값은 텍스트로 저장합니다. |
| MDB | 선택적 기존 데이터베이스 입력 · Jet OLE DB | 주요 DAT 처리 엔진의 저장소가 MDB인 것은 아닙니다. MDB 입력 오류는 별도의 provider/실행 환경 문제일 수 있습니다. |
| 개발 보조 | PowerShell, Python, 커스텀 C# 테스트 실행 파일 | 빌드·패키징·해시 확인·독립 검사에 사용합니다. 이 언어들로 프로그램 전체를 만든 것은 아닙니다. |

> **LEE.html은 웹 앱인가?**
> 현재 배포 방식에서는 `LEE.html`이 `LEE.exe`와 같은 실행 파일 바이트를 가진 다른 파일명입니다. HTML 확장자만 보고 Chrome에서 실행되는 웹 프로그램으로 이해하면 틀립니다. 이 안내서 HTML은 실제 문서이며, 제품의 LEE.html과 용도가 다릅니다.

### 시작 경로

```text
MyApplication.Main(args)
  → MyProject.Application.Run(args)
  → OnCreateMainForm()
  → new DataWorkbench(startupPath)
  → 사용자가 파일을 열거나, 전달된 시작 파일을 엶
```

문제의 시작점이 메뉴/버튼이라면 대부분 `DataWorkbench`부터 보면 됩니다. 기존 폼 파일부터 무작정 읽을 필요는 없습니다.

<a id="architecture"></a>

## 파일 하나가 결과물로 바뀌는 전체 과정 · Data flow and indexing

> **In English**
>
> LEE reads records as a stream and stores row offsets in a disk-based index. The virtual grid requests rows as needed. This avoids keeping the entire load file in memory.

1 · SELECT — **입력과 설정 선택** — 실제 파일, 인코딩, 형식, 필드, ID, 레코드 범위를 정합니다.

2 · READ — **엄격한 전체 읽기 · Strict full-file read** — LoadFileReader가 구조·인코딩을 검사하면서 전체 SHA-256을 계산합니다.

3 · INDEX — **행 위치를 디스크에 기록 · Disk-based row index** — DatWorkspace가 각 행의 바이트 위치와 길이를 보관합니다.

4 · TRANSFORM — **작업 결과를 데이터 뷰로 표현 · Data views** — 필터, 정렬, Replace, Overlay, 비교/QC 등의 엔진을 실행합니다.

5 · REVIEW — **변경·예외·범위를 검토 · Review scope and exceptions** — 필요한 승인을 받고, 원본 및 설정이 여전히 맞는지 확인합니다.

6 · SAVE — **새 파일 작성 → 실제 저장본 재검증 · Save and verify** — 생성물과 저장된 파일의 값·구조·해시를 확인하고 audit를 남깁니다.

### 왜 큰 파일에서도 동작하도록 설계했나요?

200만 행을 200만 개의 화면 행이나 큰 `DataTable`로 상시 보관하지 않습니다. 원본 파일은 그대로 두고, 행마다 **어디에서 몇 바이트를 읽어야 하는지**를 디스크 인덱스에 기록합니다. 그 행이 필요할 때 원본의 해당 위치를 읽습니다.

```text
원본 파일:  [헤더][행 1][행 2] ... [행 2,000,000]
행 인덱스:  [행1 위치, 길이][행2 위치, 길이] ...  ← 디스크
화면 요청:  Row(1234) → 해당 위치 읽기 → 필드 배열 반환
```

`DatWorkspace.OpenCore`에서 인덱스 항목은 위치와 길이 두 개의 64비트 값입니다. 이것만 계산하면 행당 약 16바이트의 인덱스이며, 200만 행이면 약 32MB의 *디스크 인덱스*입니다. 원본·다른 인덱스·캐시 전체가 32MB라는 뜻은 아닙니다.

그리드는 `VirtualMode=true`이고 한 페이지에 1,000행을 표시합니다. `GridPreviewCache`는 화면용 축약값을 제한된 크기로 보관합니다. 화면에 보이는 축약값을 Export의 원본 데이터로 사용하면 안 됩니다.

### 필터와 정렬도 원본 파일을 다시 쓰지 않습니다

- **필터 (Filtering):** 표시할 원본 행 번호의 목록을 보관하는 `RowMapView`를 만듭니다.
- **정렬 (External sorting):** 작은 묶음으로 키와 행 번호를 정렬해 디스크에 쓴 뒤 병합합니다. 결과 역시 “행 번호 순서표”입니다.
- **ID 찾기/매칭 (Exact ID lookup / matching):** `ExactIndex`가 정확한 문자열 ID를 찾습니다. 큰 항목은 디스크에 저장하고 제한된 크기의 버킷을 RAM에 둡니다.
- **파싱 (Parsing):** 한 번에 전체 파일을 문자열로 만들지 않고 스트림에서 레코드를 읽습니다. 인코딩·구조 오류는 무시하고 넘어가지 않습니다.

<a id="views"></a>

## master, view, DataSetView만 이해해도 절반은 읽힙니다 · Data views and edit history

> **In English**
>
> The master is the complete current working dataset; a view may contain filtered or reordered rows. Edits are represented through data views and disk-backed changes. Undo and Redo manage working state and its dependencies.

### master · 전체 작업 데이터 / Complete working dataset

현재 작업 상태의 전체 데이터입니다. “원본 파일과 항상 동일한 값”이 아니라, 이미 승인해 적용한 변경이 포함될 수 있습니다.

### view · 지금 보는 데이터 / Current view

전체 데이터이거나, 필터/정렬된 일부 데이터입니다. 화면의 선택한 셀, 현재 페이지, view, 전체 master는 서로 다른 범위입니다.

### DataSetView는 데이터 접근 약속입니다

파서, 필터, 변경 뷰, 병합 뷰가 모두 다음 약속을 따릅니다. UI는 내부 저장 방식이 무엇인지보다 “필드가 무엇이고, 행이 몇 개이며, 이 행의 값이 무엇인가”를 묻습니다.

```text
// 실제 DataSetView의 핵심 규약을 줄여 표시
abstract string[] Headers { get; }       // 정확한 필드 이름
abstract long Count { get; }             // 레코드 수
abstract string[] Row(long index);       // 0부터 시작하는 행
abstract void Verify(CancellationToken token); // 원본/의존성이 유효한가
abstract string Provenance { get; }      // 어디에서 온 데이터인가
```

| 뷰 | 역할 | 이해하기 쉬운 예 |
| --- | --- | --- |
| `DatWorkspace` | 실제 입력 파일과 행 위치 인덱스 | 원본 DAT를 직접 읽는 기반 |
| `RuleView` | 원본 행을 읽을 때 규칙을 적용해 새 값 반환 | 지정한 값 치환, 계산된 PAGECOUNT |
| `RowMapView` | 다른 행 번호로 연결 | 필터 결과, 정렬 순서 |
| `MetadataDelta` | 변경한 셀 값만 디스크에 보관 | Overlay, 특정 셀/필드 업데이트 |
| `VolumeSetView` | 여러 입력을 선택한 순서대로 연결 | VOL001 + VOL002 + VOL003 |
| `SelectionMergeView` | 선택한 부분의 변경을 전체 데이터로 반영 | 필터된 100행만 수정하고 나머지는 유지 |

### 수정 적용과 Undo/Redo · Applying edits and history

`DataWorkbench.Apply`는 기존 상태를 잡고, 작업 결과를 만들고, 잠긴 필드와 전체 레코드를 검증한 뒤 새 상태를 활성화합니다. 필터된 부분을 바꾸면 해당 변경을 전체 master로 다시 연결합니다.

Undo/Redo는 매번 전체 원본 파일을 복제하는 단순 방식이 아니라, 데이터 뷰·화면 상태·관련 자원을 포함한 `HistoryState`를 관리합니다. 새 편집이 적용되면 이전 Redo 경로가 끊깁니다.

> **물리 파일 이름 변경 (Physical file renaming)은 예외입니다.** 메타데이터 편집은 원본 DAT를 덮어쓰지 않지만, 승인한 Bulk rename은 실제 native 파일 이름/위치를 바꿀 수 있습니다. 이 경우 Undo는 실제 파일의 바이트와 충돌까지 검사하는 거래/복구 작업이며, 외부에서 파일이 바뀌면 차단될 수 있습니다.

### 화면으로 같은 값이 보여도 내부 결과는 다를 수 있습니다

정렬된 view의 “첫 행”은 원본의 첫 행이 아닐 수 있습니다. 내부 행 번호는 0부터, 사용자 보고서는 보통 1부터 시작합니다. “레코드 1,234”가 어느 입력·어느 범위의 번호인지 함께 확인해야 합니다.

<a id="workflows"></a>

## 자주 쓰는 기능을 엔진 관점으로 보기 · Core workflows

> **In English**
>
> ID comparison matches exact string identifiers. Replace transforms selected field values, while Overlay brings in values from another source by ID. Always confirm the selected fields, input sources, and record scope.

### ① DAT 비교 · Exact ID comparison

> **In English**
>
> Comparison uses exact IDs, including case, whitespace, and leading zeroes. The Original and Updated labels customize output headers; they do not change the matching key. The optional row-based QC comparison is a different operation.

`IdComparison.Run`은 B의 정확한 ID와 비교 값을 디스크 기반 구조에 기록하고, A를 순서대로 읽으면서 대응되는 B를 찾습니다. ID는 숫자로 변환하지 않습니다. `001`과 `1`, 대소문자나 앞뒤 공백이 다른 값은 같은 ID라고 추측하지 않습니다.

- A와 B의 ID 필드와 비교 필드 쌍은 독립적으로 설정합니다.
- 빈/중복 ID나 애매한 필드 연결은 정확한 매칭을 방해하므로 관련 작업을 차단합니다.
- Changed, Only in A, Only in B 등의 결과와 제외한 필드 범위를 구분합니다.
- 긴 비교 보고서가 변경 셀 단위라면, `ComparisonWide`는 변경 레코드 단위 side-by-side로 재구성합니다.
- 사용자 지정 `(Original)`, `(Updated)` 접미어는 저장 헤더에 반영됩니다. 매칭 ID를 바꾸는 설정은 아닙니다.

> QC 화면의 선택적 Compare에는 **행 위치 기준 비교**가 있습니다. 이것을 DAT의 **Compare IDs**와 같은 방식이라고 설명하면 안 됩니다. 순서가 달라진 파일은 ID 기준 비교가 필요한지 먼저 확인합니다.

### ② Replace / Overlay · Value transformation and ID-based updates

> **In English**
>
> Replace changes values using the selected task. Overlay matches IDs and applies values from a donor source. Sequential operations may read already-applied changes; confirm the rule order and scope.

**Replace**는 선택한 필드의 값을 정한 규칙으로 바꾸는 작업입니다. 마지막으로 승인한 필드·작업 설정을 재사용할 수 있지만, 실행 범위와 현재 입력에 유효한지는 다시 확인합니다. **Overlay**는 다른 입력의 값을 정확한 ID로 매칭해 가져오는 작업입니다. 원본과 donor 양쪽의 의존성을 유지하며 변경 셀과 예외를 검토해야 합니다.

연속된 작업은 현재 데이터에 이미 적용된 결과를 읽을 수 있습니다. “모든 단계가 최초 원본만 읽는다”고 일반화하지 마십시오. 규칙/Recipe의 순서와 해당 엔진이 원본·중간 결과 중 무엇을 사용하는지 확인합니다.

### ③ QC · Check scope and evidence

> **In English**
>
> Quick Package QC checks file existence, size, and readability. Hash checks omitted in Quick mode are NOT CHECKED. A successful configured QC run does not by itself prove that the package meets every delivery requirement.

| 검사 | 무엇을 확인하는가 | 무엇으로 확대 해석하면 안 되는가 |
| --- | --- | --- |
| 기본 Load-file QC | 헤더, 구조, 값, 선택한 링크/비교 등 설정된 검사 | 체크하지 않은 항목까지 검사했다는 주장 |
| Field rules | 사용자/SOW의 required·날짜·숫자·허용값·정규식·길이 규칙 | 기술 형식만으로 ticket/SOW가 모두 맞다는 주장 |
| Bates / Family QC | 번호 범위·연속성·선택한 페이지 수/가족 정보의 일관성 | 실제 이미지의 내부 페이지를 모두 디코딩했다는 주장 |
| Package QC Full | 선택한 linked file의 읽기/크기/해시 및 설정된 부가 검사 | 패키지가 나중에도 그대로라는 보장, 플랫폼 import 성공 |
| Package QC Quick | 존재·크기·읽기 가능 여부의 빠른 확인 | 해시 검증, native 중복 내용/선택 hash-field 비교 완료 |
| Delivery QC batch | 설정한 검사들을 묶어 실행하고 단계별 결과를 정리 | 한 단계의 성공을 실패/생략한 단계까지 포함한 전체 PASS로 해석 |

Quick는 속도를 위해 *검사 범위를 명시적으로 줄인 모드*입니다. 생략한 해시 관련 검사는 `NOT CHECKED`로 이해해야 합니다. Full의 검사 범위를 유지한 단순 최적화와 구분합니다.

### ④ OPT 합치기 · Combining OPT page records

> **In English**
>
> OPT combine preserves the reviewed input order, page records, IDs, volume names, and paths. It does not merge image files or automatically repair relative paths.

`OptCombine313`은 여러 OPT를 검토한 순서대로 하나의 새 OPT로 저장합니다. 헤더 없는 7열, 정확한 페이지 ID, 문서 시작 Y 표시, 선언 페이지 수와 문서 경계를 검사합니다. 중복 ID를 자동 제거하거나 이미지 경로·볼륨을 마음대로 다시 쓰지 않습니다.

이미지 경로와 볼륨을 그대로 보존한다는 것은, 파일을 다른 폴더로 옮긴 뒤 상대경로가 자동으로 맞춰진다는 뜻이 아닙니다. 합치기 자체는 실제 이미지 존재나 대상 플랫폼 import를 보장하지 않습니다.

### ⑤ PAGECOUNT 채우기 · Page count from Bates metadata

> **In English**
>
> In the documented 3.1.6 release, Populate page count calculates counts from Bates beginning and ending values. It does not count pages inside TIFF or PDF files, or populate counts from OPT.

3.1.6의 `PageCount316`은 유효한 Beg/End 번호에서 페이지 수를 계산합니다. 예를 들어 같은 접두어의 ABC0001–ABC0004라면 4입니다. 먼저 모든 오류를 검사하며 오류가 있으면 일부만 적용하지 않고 중단합니다. **이 기능은 PDF/TIFF의 실제 내부 페이지를 세는 기능도, OPT에서 값을 채우는 기능도 아닙니다.**

### ⑥ Export · DAT, CSV and XLSX outputs

> **In English**
>
> DAT is the default load-file output. CSV is an explicit option using UTF-8 BOM in this Excel workflow, and split export repeats the header in each part. XLSX is mainly for CX reports and writes text cells to preserve identifiers.

- **DAT 기본:** Concordance용 thorn `þ / U+00FE` qualifier와 `DC4 / U+0014` separator, Unicode 기본. 화면에서 DC4를 ¶처럼 표시하더라도 실제 문자 ¶와는 다릅니다.
- **CSV:** 명시적 선택. 해당 워크플로에서 UTF-8 BOM + comma + CSV quotes를 사용합니다. UTF-16 입력은 지원하지만 이 Excel 워크플로의 UTF-16 CSV 출력은 차단합니다. CSV 형식 자체가 UTF-16을 금지한다는 뜻은 아닙니다.
- **CSV split:** 선택 범위·필드 순서·헤더를 유지하면서 지정한 레코드 수로 나누고, 각 part에 헤더를 반복합니다. 50만 건은 사용자 관측을 반영한 출발점이며 플랫폼의 보편적 상한이 아닙니다.
- **XLSX:** CX 보고서 용도가 중심입니다. 문자열 셀로 ID/앞자리 0을 보존하고, 큰 결과는 시트로 나눕니다. 지원 한계를 넘으면 값 절단 대신 중단합니다.
- **Legacy CSV encoding loss:** 표현 불가능한 문자가 있으면 자세한 위치·원본/제안 값의 증거와 해당 export의 새 승인이 필요합니다. `WITH ENCODING LOSS`는 무손실 PASS가 아닙니다.

<a id="integrity"></a>

## “검증됨”이 정확히 무슨 뜻인지 설명하기 · Validation and evidence

> **In English**
>
> Generated-output validation and saved-file verification are separate steps. A verified result is tied to the exact input, settings, output, hashes, and tool version. Review-platform import acceptance remains a separate check.

SETUP · 설정 상태 · REVIEW · 검토 필요 · ERROR · 오류/차단 · NOT CHECKED · 검사하지 않음 · VERIFIED · 정해진 검증 완료 ·

### 서로 다른 세 단계 · Three levels of validation

1. **설정/인식 (Setup / recognition):** 샘플에서 형식·인코딩을 인식하고 필드를 선택했습니다. 전체 파일 검증 완료가 아닙니다.
2. **생성물 검증 (Generated-output validation):** 임시 출력의 구조와 모든 관련 값을 예상 결과와 비교했습니다. 실제 저장된 파일과 동일하다는 증거는 별도로 필요합니다.
3. **저장본 검증 (Saved-file verification):** 실제 저장된 파일 전체를 다시 읽고, 구조·내용·SHA-256을 검증했습니다. 해당 이름·형식·입력·설정·도구 버전에 묶인 audit를 남깁니다.

### 내보내기의 안전 장치 · Export safeguards

```text
원본/작업 결과의 의존성 유지
  → 새 임시 파일에 스트리밍 작성 + SHA-256 계산
  → 임시 파일 전체를 읽어 값/구조 검증
  → 원본이 아직 같은지 확인
  → 기존 파일을 덮어쓰지 않고 새 목적지로 이동
  → 실제 저장본 전체 다시 읽기 + SHA-256 확인
  → 검증된 파일의 pin 유지 / 필요한 재해시
  → 정확한 결과에 audit 작성
```

특정 로컬 원본과 단순 범위 뷰에서는 원본 읽기를 줄이는 최적화가 있습니다. 검증한 임시 파일과 실제 저장본의 전체 해시가 같고, 원본의 변경 불가능한 pin이 계속 유지되는 조건에서 적용합니다. **저장본 재읽기를 건너뛰는 최적화가 아닙니다.** 알 수 없는/변환된/잠글 수 없는 뷰는 같은 최적화를 무조건 적용하지 않습니다.

### SHA-256, pin, snapshot을 구분하기

| 개념 | 쉬운 뜻 | 주의점 |
| --- | --- | --- |
| SHA-256 | 파일 전체 바이트의 지문 | 같은 이름·크기·시간만으로 동일 파일이라고 판단하지 않습니다. 해시는 암호화나 사실 관계 검증이 아닙니다. |
| Source pin | 읽기 핸들을 잡아 로컬 원본의 쓰기/이동/삭제를 막는 상태 | 로컬의 효과적인 잠금과 네트워크/비보장 잠금을 구분합니다. 비보장 상태는 재해시 등의 검증이 필요합니다. |
| Snapshot | 해당 작업이 사용한 입력·설정·범위의 고정된 조합 | 나중에 입력이나 매핑이 바뀌면 예전 결과/승인을 새 작업에 적용하면 안 됩니다. |
| Provenance | 원본 경로·해시·변환/의존성의 출처 정보 | 필드 이름만 같다고 같은 데이터/같은 업무 의도라고 볼 수 없습니다. |
| Audit | 도구 버전, 작업, 입력과 출력 해시 등을 적은 증거 파일 | 결과 파일만 복사하고 audit를 잃으면 당시 검증 근거를 설명하기 어려워집니다. |

> **고객에게 말할 수 있는 범위:** “지정한 입력과 설정으로 만든 이 저장 파일의 자동 검증을 마쳤습니다.”
> **추가 확인이 필요한 범위:** ticket/SOW의 업무 의미, 실제 redaction/content, 모든 companion의 완결성, chain of custody, Relativity/Nuix import 성공. 기능별로 무엇을 검사했는지 보고서와 audit에서 확인합니다.

### 취소와 오래된 결과 · Cancellation and stale results

새 입력·설정·편집·취소·실패는 관련 결과와 승인을 무효화해야 합니다. 백그라운드 작업이 늦게 끝나더라도 예전 입력의 결과가 새 화면에 활성화되면 안 됩니다. Compare나 인코딩 인식의 문제를 조사할 때에는 실제 계산뿐 아니라 이 상태 관리도 확인합니다.

<a id="source-map"></a>

## 문제가 나면 어느 파일을 볼까요? · Code map

> **In English**
>
> Start with the menu handler in DataWorkbench, follow the inputs into the operation engine, and then inspect validation and saving. The filenames below refer to the private development tree; the source files are not included in this guide.

아래 경로는 `C:\Coding\Tools\edml-analysis\` 기준입니다. 모든 파일을 처음부터 읽는 대신 기능으로 검색하고, 메서드 하나씩 아래 방향으로 따라갑니다.

| 증상 / 역할 | 우선 읽을 파일 | 찾을 단서 |
| --- | --- | --- |
| 프로그램 시작·명령행 파일 | `src/eDML.My/MyApplication.cs` | Main, OnCreateMainForm, startupPath |
| 메뉴/버튼·현재 데이터·수정·Undo | `src/eDML/DataWorkbench.cs` | Add, Execute, Apply, master, view, HistoryState, verified |
| 인코딩·구분자·필드 수·읽기 오류 | `src/eDML/LoadFileReader.cs` | StrictEncoding, Read, ParseRecord, VerifyUnchanged |
| 파일 열기·행 인덱스·원본 변경 | `src/eDML/DatWorkspace.cs` | OpenCore, RecordText, Verify, SourceLock, ExactIndex |
| 원본 재해시가 반복됨·검증 정책 | `src/eDML/ProgressStatus.cs` | SourceVerification, Operation, Covered, Early |
| 타이머만 돌고 Indexing이 진전 없음 | `src/eDML/IndexingWatch.cs`   `src/eDML/OperationWindow.cs` | IdleLimitSeconds, bytes/records/characters, Task.Run, CancellationToken |
| 화면의 긴 값 축약·셀 표시 | `src/eDML/GridPreviewCache.cs`   `src/eDML/DataWorkbench.cs` | PreviewCharacters, Row, CellValueNeeded, PageSize |
| 필터·정렬·디스크 변경값 | `src/eDML/DiskOperations.cs`   `src/eDML/DatWorkspace.cs` | Sort, DerivedValues, RowMapView, SelectionMergeView |
| Replace·ATT·기존 데이터 변환 | `src/eDML/LegacyOperations.cs`   `src/eDML/DataWorkbench.cs` | UI의 Replace부터 실제 변환 메서드로 이동 |
| Overlay·입력 donor·변경 셀 | `src/eDML/LoadFileIntegration.cs`   `src/eDML/DataWorkbench.cs` | MetadataDelta, Overlay, 원본+donor Verify |
| 정확한 ID 비교 | `src/eDML/IdComparison.cs` | Run, keyA/keyB, ComparePair, SideTable, ExactIndex |
| 비교 화면·재사용/오래된 결과 | `src/eDML/ComparisonOutput306.cs`   `src/eDML/CompareSource297.cs` | 입력/설정 snapshot, 현재 결과 활성화 조건 |
| Side-by-side·Original/Updated 헤더 | `src/eDML/ComparisonWide.cs`   `src/eDML/ComparisonLabels305.cs` | ColumnLabels, Fill, 값 그룹·헤더·저장본 검증 |
| Package QC·OPT·native/text·Quick | `src/eDML/PackageQc.cs`   `src/eDML/AdditionalDialogs.cs` | PackageOptions, Quick, OpenImages, actual decoding, NOT CHECKED |
| Bates·PAGECOUNT | `src/eDML/BatesQc.cs`   `src/eDML/PageCount316.cs`   `src/eDML/DataWorkbench.Pages316.cs` | Beg/End, 전체 레코드 검증, RuleView, blocking report |
| QC 규칙 입력·제안 | `src/eDML/FieldRules.cs`   `src/eDML/RulesInput314.cs`   `src/eDML/RuleSuggest314.cs` | 필드·규칙·인수, 제안 선택과 실행 규칙을 구분 |
| DAT/CSV 출력·저장 검증 | `src/eDML/NativeOperations.cs` | Save, VerifyOutput, AfterMoveForTests, 실제 저장 pin |
| XLSX·CSV 인코딩 손실·분할 | `src/eDML/ExcelExport304.cs`   `src/eDML/CsvOutputPolicy304.cs`   `src/eDML/ExportSplit304.cs` | CellLimit, SheetRecords, encoding loss, part counts |
| OPT 합치기·다중 파일 병합 | `src/eDML/OptCombine313.cs`   `src/eDML/VolumeMerge.cs`   `src/eDML/DataWorkbench.Merge.cs` | Open, Save, 문서 경계, 정확한 ID, 입력 순서 |
| Native 물리 파일 이름 변경·복구 | `src/eDML/NativeFileOperations.cs`   `src/eDML/DataWorkbench.RenameRecovery.cs` | RenamePlan, RenameTransaction, 충돌·바이트·rollback |
| 필드 설정·필드 찾기·인코딩 인식 | `src/eDML/WorkspaceSetup.cs`   `src/eDML/OptEncodingPolicy.cs`   `src/eDML/HeaderLayoutStore.cs` | Suggest, Probe, explicit override, header schema |
| 승인 버튼 비활성·입력칸 안내 | `src/eDML/WorkbenchDialogs.cs`   `src/eDML/DialogUsability.cs` | ParameterDialog, Fields, Validation, SetupProblem |
| 작업 세션·자동 복구 | `src/eDML/SessionStorage.cs`   `src/eDML/AutomaticRecovery.cs` | SessionGraph, dependencies, Save/Load, original hashes |
| Audit 내용·도구 버전 | `src/eDML/WorkspaceEngine.cs`   `src/Properties/AssemblyInfo.cs` | Version, Audit, AssemblyVersion, AssemblyFileVersion |
| 화면 색·글꼴·영/한 도움말 | `src/eDML/ThemePalette308.cs`   `src/eDML/HelpKorean299.cs`   `src/eDML/WorkbenchDialogs.cs` | Theme, Help; 데이터 변환과 분리해서 보기 |

> `partial class DataWorkbench`는 “하나의 클래스가 여러 파일로 나뉜 것”입니다. `Pages316`, `SourceApproval312`, `…305` 등의 숫자는 기능을 처음 추가한 버전의 흔적일 수 있습니다. 파일명만 보고 구버전이라 삭제하거나, 그 파일 하나만 현재 코드라고 판단하면 안 됩니다.

### 폴더 지도

```text
C:\Coding\Tools\
  LEE.exe / LEE.html              현재 배포 파일
  LEE.exe.config                 로컬 런타임 설정
  OLD\LEE_<version>.exe          검증된 이전 실행 파일 보존
  edml-analysis\
    src\eDML.csproj              개발 프로젝트
    src\eDML\                   핵심 화면 + 처리 엔진
    src\eDML.My\                시작/기존 앱 구조
    src\Properties\AssemblyInfo.cs
    workbench-tests\             기능·실제 WinForms 테스트
    tests\                       Export 테스트 프로젝트
    scripts\                     개발/검증 보조
    docs\                        계획·배포·체크포인트
    test-results\                버전별 증거
  github-eDiscovery\             별도 공개 배포 체크아웃
  tests\shared-data\             공용 합성 200만 건 파일
```

### 설정과 데이터 파일은 다릅니다

현재 기본 사용자 환경설정은 `%LOCALAPPDATA%\LEE\ui-preferences.xml`, 필드 레이아웃은 같은 LEE 폴더의 `header-layouts`, 자동 복구는 `%LOCALAPPDATA%\LEE\Recovery`를 사용합니다. 파일을 닫아도 설정이 남는 이유와, 원본 DAT의 메타데이터가 바뀌는 이유를 혼동하지 마십시오.

<a id="debug"></a>

## 코드에서 원인을 찾는 5단계 · Troubleshooting

> **In English**
>
> First identify the failing stage and capture the exact version, source identity, encoding, mappings, scope, and error message. Trace the handler and engine, then reproduce the issue with a small synthetic input. Do not disable validation to make a job pass.

1. **실패 위치를 먼저 정합니다.** 선택/인식, 인덱싱, 계산, 검토, 파일 작성, 저장본 재검증 중 어디에서 멈췄는지 기록합니다.
2. **정확한 상태를 고정합니다.** 실행 파일 버전·해시, 입력별 이름/해시, 실제 인코딩·구분자, 필드 쌍, 전체/view 범위, 출력 경로, 메시지를 기록합니다. 고객 값을 공개 로그에 붙이지 않습니다.
3. **화면 문구나 기능 이름으로 검색합니다.** 버튼 등록 → handler → OperationWindow → 실제 엔진 → Verify/Save 경로를 따라갑니다.
4. **정상 조건과 실패 조건을 비교합니다.** 예외를 던진 줄의 조건문과 변수 값을 보고, 입력·설정·상태 중 무엇이 예상과 달랐는지 확인합니다.
5. **작은 합성 재현과 해당 테스트를 확인합니다.** 실제 고객 입력은 수정하지 않습니다. 파서/매칭/출력 변경이면 관련 무결성·중단·대용량 검증까지 필요합니다.

```text
# 읽기/검색용 예시. 문서 작성 중 실제 빌드나 제품 테스트는 실행하지 않았습니다.
rg -n "private void Replace|ReplaceTask" C:\Coding\Tools\edml-analysis\src\eDML
rg -n "Source bytes changed" C:\Coding\Tools\edml-analysis\src
rg -n "duplicate exact identifier" C:\Coding\Tools\edml-analysis\src
```

### 읽는 순서: Replace 예

**메뉴 등록** — DataWorkbench의 Add(edit, …, Replace)

**입력 처리** — Replace()에서 필드·Task·설정 값을 읽음

**변경 활성화** — Apply → 작업 엔진 → 필드 잠금/레코드 검증 → 새 뷰

Replace의 값이 틀렸다면 먼저 “선택한 필드/Task/원본 또는 중간값/범위가 무엇이었나”를 봅니다. 화면에서 이전 필드가 남았다는 현상과, 실제 변환 알고리즘이 잘못됐다는 현상은 다른 문제입니다.

#### 사례 A · Indexing은 0인데 시간만 늘어남 · Indexing stalls / No progress

**관련 파일:** IndexingWatch → DatWorkspace.OpenCore / IdComparison의 인덱싱 → OperationWindow.

Elapsed 타이머나 움직이는 진행 막대는 UI 활동입니다. 실제 진척은 읽은 바이트·파싱 문자·처리한 레코드로 판단합니다. 읽기/인덱싱 보호 단계에는 현재 기본 120초의 무진척 감시가 있습니다. Bytes가 늘고 긴 레코드를 파싱 중이면 “레코드가 아직 0”인 것만으로 멈춤을 판단하지 않습니다.

검사할 순서: 실제 파일/경로 접근 → 선택 인코딩·BOM → 구분자/qualifier → 물리 파일 읽기나 디스크 캐시 접근 → 해당 단계에 watch가 적용되는지. 물리 rename/export 거래를 강제로 종료하는 용도로 IndexingWatch를 사용하면 안 됩니다.

#### 사례 B · ID는 같은 것 같은데 비교 결과가 다름 · Exact ID mismatch

**관련 파일:** 비교 화면의 입력/필드 쌍 → IdComparison.Run → ExactIndex.

A와 B의 실제 파일, 각각의 ID 필드, 중복/빈 ID, 대소문자/공백/앞자리 0, 비교에 포함/제외한 필드, row-based QC Compare와의 혼동을 확인합니다. B 쪽 필드가 A 쪽 선택과 잘못 연결됐는지, 이전 입력의 결과가 남았는지도 봅니다. “trim하면 맞아진다”는 이유로 자동 보정해서는 안 됩니다.

#### 사례 C · CSV가 Excel의 A열 하나로 들어감 · CSV delimiter / Single-column import

**관련 파일:** Export 설정 → NativeOperations의 CSV 형식 확인 → CSV 출력 정책.

먼저 실제 separator가 comma인지, 한 레코드 전체를 하나의 quoted field로 만든 것인지, 선택한 형식/확장자/인코딩이 맞는지 확인합니다. Excel이 기대한 delimiter나 열기 방식도 관련됩니다. 인코딩과 구분자는 독립 설정이므로 “Unicode라서 한 열”이라고 단정하지 않습니다. 현재 CSV 출력의 comma/CSV quotes/UTF-8 BOM 경로를 확인합니다.

#### 사례 D · 저장은 됐지만 verification/audit가 실패함 · Saved-file verification failure

**관련 파일:** NativeOperations.Save 또는 해당 XLSX/OPT Save → VerifyOutput/Check → WorkspaceEngine.Audit.

파일 작성 성공과 검증 성공은 다릅니다. 생성물 값/구조 불일치, 원본 변경, 저장 후 변조, 기존 목적지/권한/공유 잠금, 취소 시점, audit 쓰기 실패를 구분합니다. 실패한 파일을 검증된 납품물로 보내지 않도록 상태를 확인합니다. 원본 검증이나 saved-file reread를 꺼서 통과시키지 않습니다.

#### 사례 E · “Unknown field” / 실행 버튼 비활성 · Field mapping / Setup blocker

**관련 파일:** ParameterDialog/SetupProblem → WorkspaceSetup/HeaderLayoutStore → DataSetView.Column.

UI label과 실제 source header가 다를 수 있습니다. 이름의 대소문자·공백, 현재 헤더 구조, 예전 preset의 호환성, A/B 독립 선택, optional skip인지 required 역할인지 확인합니다. 이름 힌트는 추천일 뿐 ID의 유일성 증명이나 자동 매핑 권한이 아닙니다.

#### 사례 F · Undo는 되는데 물리 rename Undo가 막힘 · Physical rename recovery

**관련 파일:** HistoryState/Redo → RenameTransaction → NativeFileOperations → RenameRecovery.

원본 파일의 바이트가 달라졌는지, 되돌릴 이름에 새 파일이 생겼는지, 폴더/권한/경로가 바뀌었는지 확인합니다. 메타데이터 Undo와 실제 파일 이름 복구는 다릅니다. 정상 파일을 삭제하거나 충돌 파일을 덮어쓰며 복구하면 안 됩니다.

#### 사례 G · 원본/출력은 같은 이름인데 옛 PASS가 사라짐 · Stale result / PASS invalidation

**관련 파일:** DataWorkbench의 verified 무효화 → 비교 setup snapshot → SourceVerification/SessionStorage.

이름이 같아도 바이트나 설정이 달라질 수 있습니다. 편집·새 입력·매핑·범위·새 출력·취소/실패가 관련 결과를 무효화하는 것은 정상일 수 있습니다. 반대로 무효화되어야 할 PASS가 남는다면 데이터 무결성 결함으로 취급합니다.

#### 사례 H · MDB만 열리지 않음 · MDB provider / Runtime environment

**관련 파일:** LegacyOperations의 MDB 읽기 → Jet OLE DB 연결.

DAT/CSV 파서부터 수정하지 않습니다. MDB 경로, 읽기 권한, 파일 자체 상태, Jet provider와 실제 프로세스 환경을 확인합니다. 이 기능의 환경 의존성을 일반 DAT 작업의 필요 설치 항목으로 확대하지 않습니다.

<a id="questions"></a>

## 동료나 고객이 물으면 어떻게 답하나요? · Questions and answers

> **In English**
>
> Use the short English answers below as starting points for explaining the tool. Keep each answer within the checks actually performed for that job.

#### Q. 원본 DAT를 직접 고치나요? · Q. Does LEE modify the original DAT?

기본 메타데이터 편집은 작업 뷰를 바꾸며, Export는 새 파일을 만듭니다. 원본 DAT를 덮어쓰는 방식이 아닙니다. 단, 승인한 물리 rename/copy 작업은 native 파일에 별도의 영향을 줄 수 있으므로 구분해야 합니다.

> **In English:** Metadata edits update the working view, and export creates a new file. Approved physical rename or copy operations are separate and can affect native files.

#### Q. 데이터가 다 메모리에 들어가나요? · Q. Does LEE load everything into memory?

주요 로드파일 경로는 원본 + 디스크 행 인덱스 + 제한된 버퍼/캐시로 처리합니다. 매칭/정렬/변경값에도 디스크 기반 구조를 씁니다. 어떤 작업도 RAM을 쓰지 않는다는 뜻은 아니고, 모든 기능/입력 크기가 무제한이라는 뜻도 아닙니다.

> **In English:** The main load-file workflows use streaming reads, disk-based indexes, and bounded buffers and caches. This reduces memory use; it does not make every operation or input size unlimited.

#### Q. 화면의 값이 잘려 보이는데 Export도 잘리나요? · Q. Are truncated preview values also truncated in the export?

화면용 preview와 실제 값은 분리되어 있습니다. 현재 GridPreviewCache는 값당 512자 preview, 최대64행·약2Mi문자 캐시를 사용합니다. 전체 값은 편집/복사/처리/출력 경로로 읽습니다. 반대로 XLSX 등 출력 형식의 한계는 화면 축약과 별개이며, 한계 초과 시 중단하도록 되어 있습니다.

> **In English:** The grid preview is separate from the full values used for processing and export. Output format limits are checked separately; exceeding a supported limit must stop the export rather than silently truncate values.

#### Q. Filter에서 100행만 보이면 QC/Export도 100행인가요? · Q. Does a filtered view define the QC or export scope?

기능마다 scope를 확인해야 합니다. view는 필터/정렬 결과이고, master는 전체입니다. Package QC는 전체 데이터 기준입니다. Export에는 Complete dataset/current view 선택이 있습니다. 선택한 셀이나 현재1,000행 페이지가 전체 처리 범위를 뜻하지 않습니다.

> **In English:** Check the operation scope. Package QC uses the complete dataset, while export lets you choose the complete dataset or current view. The current page or cell selection is not automatically the processing scope.

#### Q. ID의 앞자리 0이나 한글이 바뀌지 않나요? · Q. Are leading zeroes and non-Latin characters preserved?

ID/필드 값은 기본적으로 문자열로 다룹니다. 숫자화, trim, Unicode 정규화를 자동으로 해 매칭하지 않습니다. 한글 보존에는 실제 입력 인코딩과 출력 인코딩이 맞아야 합니다. XLSX는 텍스트 셀을 사용하며 legacy CSV 손실은 별도 승인/증거로 구분합니다.

> **In English:** IDs and field values are treated as strings. Matching does not automatically trim, convert numbers, or normalize Unicode. Character preservation also depends on correct decoding and an output encoding that can represent the values.

#### Q. QC가 오류 0이면 바로 납품해도 되나요? · Q. Does zero QC errors mean the delivery is ready?

설정한 검사에서 오류가 없었다는 뜻으로 설명합니다. REVIEW와 NOT CHECKED, SOW, source/output identity, 실제 저장 파일, 별도 플랫폼 import를 확인해야 합니다. Quick 결과를 Full 해시 검사 완료라고 말하지 않습니다.

> **In English:** It means no errors were found by the configured checks. Review the REVIEW and NOT CHECKED items, delivery requirements, saved-file evidence, and any required target-platform import checks.

#### Q. 해시가 같으면 모든 내용이 정확하다는 뜻인가요? · Q. Does a matching hash prove the content is correct?

비교한 두 파일의 바이트 동일성을 확인하는 증거입니다. 예상 변환과 값 비교도 필요하고, 입력 자체가 올바른 고객/올바른 baseline인지의 업무 판단은 별도입니다. SHA-256은 암호화나 전자서명도 아닙니다.

> **In English:** A matching SHA-256 supports byte identity between the compared files. It does not prove that the input is the correct baseline or that the requested business transformation is correct. It is neither encryption nor a digital signature.

#### Q. 설정을 기억하는데 왜 어떤 때 다시 고르게 하나요? · Q. Why do remembered fields sometimes need to be selected again?

헤더 구조와 정확한 필드명이 현재 입력에 유효할 때만 재사용해야 하기 때문입니다. 과거 파일의 선택을 이름만 비슷한 새 파일에 강제로 적용하면 잘못된 매핑이 됩니다. 입력 경로·scope·승인·PASS를 마음대로 복원하는 것과 구분합니다.

> **In English:** A remembered selection can be reused only when it is valid for the current header layout and exact field names. Similar-looking names do not establish a correct mapping.

#### Q. OPT를 합치면 이미지도 합쳐지나요? · Q. Does combining OPT files combine the images?

OPT의 페이지 행을 합치는 것입니다. 실제 TIFF/PDF를 합치거나 이미지 경로를 다시 배치하는 작업이 아닙니다. 상대경로는 그대로 남으므로 delivery root와 실제 이미지 위치를 별도로 확인해야 합니다.

> **In English:** No. It combines OPT page records. It does not merge TIFF or PDF content or relocate image files. Check relative paths and the delivery root separately.

#### Q. PAGECOUNT는 실제 이미지 페이지 수인가요? · Q. Does PAGECOUNT reflect the actual number of image pages?

현재 Populate page count는 Bates Beg/End 메타데이터에서 계산한 값입니다. Package QC의 OPT 페이지 대조와도 구분합니다. 실제 다중 페이지 TIFF/PDF 내부의 페이지 수를 모두 읽었다고 말하면 안 됩니다.

> **In English:** The documented Populate page count feature calculates from Bates beginning and ending metadata. It does not inspect every page inside TIFF or PDF files.

#### Q. XLSX를 쓰면 Excel 설치가 필요한가요? · Q. Does XLSX export require Microsoft Excel?

현재 핵심 XLSX 출력 엔진은 ZIP/XML을 직접 만듭니다. 파일 생성 때문에 Excel 자동화를 요구하지 않습니다. 파일을 실제 Excel/CX 양식/대상 시스템에서 잘 사용하는지는 별도 확인입니다.

> **In English:** The core exporter writes XLSX ZIP and XML structures directly, without automating Excel. Actual use in Excel, a CX report template, or another target system still needs its own check.

#### Q. 세션 저장과 Export는 무엇이 다른가요? · Q. What is the difference between saving a session and exporting?

Export는 고객에게 전달할 DAT/CSV/XLSX 같은 결과 파일입니다. 세션/복구는 현재 작업 데이터·뷰·이력·의존성을 이어가기 위한 상태입니다. 모든 임의의 데이터 뷰가 세션에서 지원되는 것은 아니며, 원본 경로/해시가 달라지면 복원이 차단될 수 있습니다.

> **In English:** Export creates a delivery file such as DAT, CSV, or XLSX. A session preserves supported working data, views, history, and dependencies for continuation; it can be blocked if source paths or hashes change.

#### Q. 왜 “원본이 바뀌었다”는 오류로 멈추나요? · Q. Why does the job stop when the source changes?

계산·검토했던 데이터와 다른 바이트로 결과를 만들거나 승인하면 잘못된 provenance가 됩니다. 이 경우 중단은 의도된 보호입니다. 실제 파일을 확인하고 올바른 입력으로 다시 시작해야 합니다.

> **In English:** The result and approval must refer to the same source bytes that were processed and reviewed. A source change invalidates that basis. Confirm the correct source and restart with it.

#### Q. 내부에 299/305/316이 붙은 파일은 구버전인가요? · Q. Do version numbers in source filenames mean those files are obsolete?

기능을 추가한 버전을 기억하는 이름인 경우가 많습니다. 현재 프로젝트에 포함되고 현재 handler가 호출하면 현행 코드입니다. public 배포 버전은 AssemblyInfo/WorkspaceEngine와 검증된 실행 파일, release 기록으로 판단합니다.

> **In English:** Not necessarily. Many filenames record when a feature was introduced. If the current project includes the file and the current handler calls it, it may still be active code. Confirm the shipped version from the tested artifact and release evidence.

<a id="limits"></a>

## 설계 목표, 코드 한계, 실제 시험을 분리하기 · Limits and measured scale

> **In English**
>
> The design uses bounded memory, and the recorded synthetic test contains two million records in a roughly 2.47 GB DAT. This does not establish performance for millions of separate physical files or acceptance by every target platform.

| 항목 | 현재 코드/기록에서 확인한 범위 |
| --- | --- |
| 설계 목표 | 수백만 레코드·수GB 로드파일, 스트리밍·디스크 기반 처리, 전량 검증 |
| 필드 수 | LoadFileReader 최대254필드. Side-by-side 등 추가 열이 필요한 기능은 별도 낮은 한계가 있을 수 있음 |
| 단일 레코드 | 16Mi 문자 한계. “16MB 파일 전체” 제한이 아님 |
| 그리드 | 1,000행 단위 표시. 기반 인덱스/그리드는 2,147,483,647 미만 레코드 제한이 있음 |
| 정렬 키 | 65,536자 초과는 중단. 정렬 묶음은 최대5,000행 또는 약2Mi문자 기준으로 나눔 |
| XLSX | 시트당 데이터1,048,575행 + 헤더, 최대256시트. 셀32,767 UTF-16 units 또는253 line feeds 초과 시 중단 |
| 붙여넣기 | 16Mi문자·50,000행·100,000셀 한계. 구조 오류나 범위 초과는 부분 적용하지 않음 |
| OPT 합치기 | 2–1,024개 OPT 파일. 페이지 행·ID·문서 경계를 검사하며 실제 image files/import는 별도 |
| 공용 대용량 시험 | 합성2,000,000레코드 / 2,471,194,958바이트 DAT. 작은 native/text companions 두 개 포함 |
| 배포3.1.6 기록 | 집중18·전체583·Export24·연습2·대용량2 통과 기록, 메인 제어배율/실제 시작 확인. 이번 안내서 작업에서 재실행한 것은 아님 |
| 미확인 영역 | 수백만 개의 서로 다른 물리 파일, 모든 NAS/권한/보안 정책, 실제 per-monitor DPI, 모든 대상 플랫폼 import, 실 TIFF/PDF 내부 페이지 완전성 |

2GB 넘는 하나의 DAT를 읽은 시험과, 수십만~수백만 개의 native 파일을 실제 파일 시스템에서 검사한 시험은 다른 시험입니다. “큰 데이터 시험이 통과했으니 모든 규모/저장장치에서 준비 완료”라고 일반화하지 않습니다.

> **좋은 설명:** “주요 엔진은 bounded-memory 방식이고, 합성200만 건/약2.47GB를 검증한 기록이 있습니다. 물리 파일 수와 대상 시스템 import는 그 기록의 범위와 별도로 봐야 합니다.”

<a id="plan"></a>

## 계획과 개발 이력을 읽는 순서 · Development and release workflow

> **In English**
>
> A planned feature is not a shipped feature. Check the current checkpoint, release notes, tested build hash, and published artifact. Group at least three useful improvements into a verified release without removing integrity checks.

1. `docs/lee-current-checkpoint.md` 맨 위: 현재 소유/진행·완료·중단 상태. 아래 오래된 기록을 현재 상태로 읽지 않습니다.
2. `README.md`와 `docs/lee-development-overview-ko.md` 맨 위: 현재 배포본과 사용자가 체감할 변경.
3. `docs/lee-<version>-…-plan-…md`: 후보의 재현, 영향 범위, 왜 이 변경이 필요한지.
4. 해당 `…release…md`와 `test-results/<작업>/`: 실제 통과한 빌드·해시·실패/수정·검증 근거.
5. canonical source와 실행 파일 버전/해시: 문서와 코드가 같은 결과를 설명하는지.

### 현재 남은 계획은 “확정 기능”이 아닙니다

읽은 3.1.7 후보 문서에는 Full Package QC의 제한된 병렬 해싱, 병합된 볼륨별 linked-file root, OPT에서 PAGECOUNT 채우기가 있습니다. 각각 저장장치 실측, 명시적인 root authority, 데이터/Undo/세션의 수명 검증이 필요합니다. 최신 체크포인트는 이 후보들을 실사용 피드백 항목으로 남긴 중단 기록을 포함합니다. 사용자께서 다른 AI의 작업을 알렸으므로, 이 기록만으로 다른 작업이 없다고 가정하지 않았습니다.

### 변경 원칙

우선순위는 편의성·직관성·입력 최소화·실수 예방, 데이터 완결성을 유지한 속도입니다. 이름 힌트를 권한 있는 매핑으로 바꾸거나, 검증을 지워서 속도를 높이면 안 됩니다. 확정한 유용한 개선을 최소3개 이상 묶어 한 버전으로 검증·배포합니다. 하나의 기능의 setup/preview/export를 억지로3개로 세지 않습니다.

### 테스트는 어디에 있나요?

`workbench-tests`는 커스텀 C# 실행 파일 기반이며 실제 WinForms 화면 테스트와 core/상태/무결성 테스트가 함께 있습니다. `tests`의 Export 실행 파일은 출력 엔진을 검사합니다. Python의 독립 검사에서는 제품 파서/serializer를 그대로 재사용하지 않도록 설계합니다.

테스트의 `passed=N`은 해당 harness의 테스트 그룹 수입니다. “모든 고객 시나리오”나 “단언문 N개”라고 번역하지 않습니다. `ForTests`로 끝나는 hook은 변조/취소 같은 상황을 만들기 위한 도구이며, 제품의 검증을 무력화하는 해결책으로 쓰면 안 됩니다.

### 배포 구조

개발 폴더와 공개 배포 체크아웃은 분리되어 있습니다. 검증된 실행 파일은 로컬 root·버전별 OLD·승인된 Git 배포 파일의 SHA-256을 맞춰 게시합니다. 현재 회사 배포 전 지침은 난독화 없이 `LEE.exe`와 동일 바이트 `LEE.html`만 게시하고, 소스·테스트·설정·고객 자료는 공개하지 않는 것입니다.

<a id="learning"></a>

## 어디까지 공부하면 질문에 대답할 수 있나요? · Learning path and terminology

> **In English**
>
> Learn the input, scope, transformation, output, and verification steps first. Then trace one workflow from its UI handler to the engine and save path. You do not need to memorize every source file to explain or troubleshoot the tool.

### 첫 번째 · 업무 설명

이 문서의 01·05·06·09를 읽습니다. 각 기능의 입력/범위/출력, Quick와 Full, metadata page count와 실제 image page count, saved verification과 import acceptance를 구분해 설명합니다.

### 두 번째 · 데이터 흐름

DataSetView → DatWorkspace.OpenCore → Row/Verify → RuleView/RowMapView → NativeOperations.Save 순서로 읽습니다. “원본/전체 작업 데이터/현재 보기/저장 파일” 네 가지를 종이에 그릴 수 있으면 좋습니다.

### 세 번째 · 기능 하나 추적

Replace 또는 Compare를 골라 메뉴 등록 → handler → UI 값 → 작업 엔진 → 검증 → 결과 활성화를 따라갑니다. 실패 지점에서 어떤 조건문이 false가 됐는지 설명할 수 있게 연습합니다.

### 네 번째 · 재현과 증거

관련 기존 테스트 하나를 읽고, 독립적인 기대값과 실패 조건을 확인합니다. 원본 변경·중복 ID·취소·저장 후 변조가 왜 성공 결과를 막아야 하는지 설명합니다.

### 설명할 때 자주 쓰는 용어 · Key terminology

한국어 뜻과 영어 표현을 함께 익히면, 코드의 이름과 업무 설명을 연결하기 쉽습니다. 고객에게는 *input, scope, changes, output, verification* 순서로 설명하면 됩니다.

| 한국어 | English | 이 문맥에서의 뜻 |
| --- | --- | --- |
| 로드파일 | Load file | 문서 ID·메타데이터·연결 경로를 담는 입력 파일 |
| 메타데이터 | Metadata | 문서에 관한 필드 값. 실제 native content와 구분 |
| 기준본 / 비교 대상 | Baseline / Comparison source | 어느 입력을 기준으로 판단하는지 명시 |
| 문서 식별자 / 비교 키 | Document ID / Matching key | 레코드 매칭에 사용하는 정확한 문자열 |
| 필드 연결 | Field mapping | A/B 입력의 어떤 필드끼리 연결하는지 |
| 작업 범위 | Record scope | Complete dataset / Current view 등 처리 대상 |
| 전체 작업 데이터 | Complete working dataset / Master | 이미 적용된 편집을 포함한 현재 전체 상태 |
| 현재 보기 | Current view | 필터·정렬된 데이터 표현 |
| 엄격한 디코딩 | Strict decoding | 잘못된 바이트를 대체 문자로 조용히 바꾸지 않음 |
| 구분자 / 한정자 | Delimiter / Text qualifier | 필드 경계와 텍스트 감싸기 규칙. Encoding과 별도 |
| 스트리밍 처리 | Streaming processing | 한 번에 전체 파일을 RAM에 적재하지 않고 순차 처리 |
| 제한된 메모리 사용 | Bounded-memory processing | 입력 전체 크기에 맞춰 RAM을 계속 늘리지 않는 처리 방식 |
| 디스크 기반 인덱스 | Disk-based index | 행 위치나 매칭 정보를 디스크에 저장 |
| 가상 그리드 | Virtual grid | 화면에 필요한 행을 요청해 표시 |
| 외부 정렬 | External sorting | 작은 정렬 묶음을 디스크에 쓰고 병합 |
| 원본 고정 / 변경 방지 | Source pin / Effective source lock | 읽기 핸들의 잠금 효력에 따라 원본 동일성 검증 경로가 달라짐 |
| 작업 스냅샷 | Operation snapshot | 특정 입력·설정·범위를 고정한 조합 |
| 출처 / 변환 이력 | Provenance | 데이터의 입력·해시·변환·의존성 정보 |
| 감사 기록 | Audit trail / Audit report | 어떤 파일·설정·검증에 관한 증거인지 함께 확인 |
| 생성물 검증 | Generated-output validation | 생성한 임시 결과의 구조·값 검사 |
| 저장본 검증 | Saved-file verification | 실제 저장된 파일을 다시 읽어 해시·내용 확인 |
| 대상 시스템 업로드 확인 | Target-platform import validation / Acceptance | 실제 Relativity/Nuix 등 대상 환경의 별도 확인 |
| 검사하지 않음 | NOT CHECKED | 검사 범위에서 빠진 항목. 통과한 검사로 세지 않음 |
| 검토 필요 / 차단 오류 | Review item / Blocking error | 사용자 판단이 필요한 항목과 진행 불가 오류를 구분 |
| 오래된 결과 무효화 | Stale-result invalidation | 입력·설정 변경 후 예전 결과와 승인을 재사용하지 않음 |
| 무진척 감시 | No-progress watchdog | 타이머가 아니라 실제 읽기·파싱·처리량 진척을 감시 |
| 인코딩 손실 | Encoding loss | 출력 문자셋에 표현 불가능한 값. 해당 export의 명시적 승인 필요 |
| 회귀 테스트 / 재현 | Regression test / Reproduction | 수정한 실패가 다시 발생하지 않는지 독립 기대값으로 확인 |

### C#에서 우선 읽을 문법 · C# reading essentials

| 문법 | LEE에서 읽는 뜻 |
| --- | --- |
| `class / partial` | 기능/상태를 가진 객체. partial은 같은 클래스의 여러 파일 분할 |
| `abstract / override` | DataSetView의 공통 약속과 각 데이터 뷰의 실제 구현 |
| `using / IDisposable` | 파일 핸들·인덱스·캐시 등의 수명을 끝내 자원을 해제 |
| `try / catch / finally / throw` | 실패 보고와 안전한 정리. finally는 취소·오류에도 필요한 정리 경로 |
| `Action / Func / lambda` | 버튼 handler나 행 변환 규칙을 함수 값으로 전달 |
| `async / await / Task.Run` | 화면을 유지하면서 작업 스레드에서 오래 걸리는 처리를 실행 |
| `CancellationToken` | 취소 요청을 안전한 지점에서 확인. 강제 프로세스 종료와 다름 |
| `internal / private` | 같은 assembly에서 접근하는 규약과 클래스 내부 상태의 경계 |
| `long / int / string[]` | 큰 레코드 번호, 일부 UI/배열 한계, 한 레코드의 문자열 필드 배열 |

> 목표는 모든 파일을 암기하는 것이 아닙니다. **무엇을 입력으로 잡았는지, 어느 범위를 읽었는지, 어떤 규칙을 적용했는지, 무엇을 다시 검증했는지**를 설명하고, 그 책임을 가진 메서드까지 찾아갈 수 있으면 됩니다.

조사 근거: 로컬 csproj, MyApplication, DataWorkbench, LoadFileReader, DatWorkspace, ProgressStatus, OperationWindow, IndexingWatch, DiskOperations, IdComparison, 출력/QC/세션 엔진 및 현재 README·배포/후보 기록. 제품 동작 재실행 없이 읽은 구조 설명입니다. 조사·검증 원자료는 개발 폴더에 보존합니다. 공유하는 이 안내서에는 소스 파일이나 고객 데이터가 포함되지 않습니다.
