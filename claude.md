# IMAX Student - 프로젝트 분석 문서

## 프로젝트 개요

**일산맥스 학원 정시 입시 상담 시스템** - 학생들이 수능 성적을 입력하고 대학별 정시 환산 점수를 계산하여 지원 가능 대학을 탐색할 수 있는 PWA 웹앱

### 기술 스택
- **Frontend**: HTML, CSS, JavaScript (바닐라)
- **Backend**: Node.js + Express
- **Database**: MySQL (jungsi, jungsimaxstudent, 26susi DB)
- **인증**: JWT 토큰 기반
- **AI 챗봇**: n8n + Google Gemini API

### 현재 버전
- **APP_VERSION**: `2025-12-04-06`
- **Git**: main 브랜치

---

## 아키텍처

```
[클라이언트 - imaxstudent]          [서버 - supermax]              [AI]
     │                                    │                          │
     ├── index.html (메인 프레임)         ├── jungsi.js (포트 9090)   ├── n8n 워크플로우
     ├── welcome.html (홈)               ├── jungsical.js            │   (imax-student-chat)
     ├── search.html (대학찾기)          ├── silgical.js             └── Gemini API
     ├── saved_list.html (저장대학)      │
     ├── practical.html (실기관리)       └── ilsan-max.js (포트 8321)
     ├── imax_ai.html (AI 챗봇) ←────────────┘ (프록시: /maxai/imax-student-chat)
     ├── ranking.html (랭킹)
     ├── mypage.html (마이페이지)
     └── student_login.html (로그인)
```

---

## IMAX AI 챗봇 (신규 기능)

### 파일 구조
| 파일 | 설명 |
|------|------|
| imax_ai.html | AI 챗봇 UI (다크 테마, 모바일 최적화) |
| n8n_imax_ai_workflow.json | n8n 워크플로우 (Gemini 기반) |

### n8n 워크플로우 구조
```
Chat Trigger → AI Agent(의도분석) → JSON파싱 → IF(API필요?)
                    │                              ├─ Yes → URL생성 → API호출 → AI Agent(응답생성)
                    │                              └─ No → IF(랜덤?) → 랜덤뽑기 or 일반응답
                    └── Memory (대화기록 10개)
```

### 의도분석 프롬프트 핵심

#### 질문 유형 분류 (info_type)
| 유형 | 설명 | 예시 |
|------|------|------|
| ratio | 반영비율, 실기비중 질문 | "숭실대 실기 비중 몇프로?" |
| score_table | 배점표, 실기배점 질문 | "성신여대 운재 배점표" |
| basic | 모집정원, 실기종목 질문 | "국민대 스교 모집정원" |
| all | 전체 정보 | "한양대 정보" |

#### 대학명 약어
```
성신/성신여대→성신여자대학교, 숙대/숙명→숙명여자대학교
국대/국민대→국민대학교, 한대/한양대→한양대학교
체대/한체대→한국체육대학교, 용대/용인대→용인대학교
숭실대→숭실대학교, 가천대→가천대학교
```

#### 학과명 약어
```
스교→스포츠교육, 체교→체육교육, 스과→스포츠과학
스레→스포츠레저, 운재→운동재활, 스산→스포츠산업
생체→생활체육, 특체→특수체육
```

### 응답생성 프롬프트 핵심

#### info_type별 응답
- **ratio**: 수능/실기 비율만 간단히
- **basic**: 물어본 것만 답변
- **score_table**: 배점표만 (아래 형식)
- **all**: 전체 정보 + 배점표

#### 실기배점표 출력 형식
```
📊 [종목명]
* 100점: 남 12.5초 / 여 14.0초
* 96점: 남 12.7초 / 여 14.2초
...
```
- 여자대학은 여 기록만
- 반드시 `*`로 시작 (프론트에서 테이블로 변환)

### 프론트엔드 테이블 변환
- `📊 종목명` + `* 점수: 남 OO / 여 OO` 패턴 감지
- 남/여 둘 다 있으면 → **배점 | 남 | 여** 3열 테이블
- 여자만 있으면 → **배점 | 기록** 2열 테이블

### API 프록시
- **프론트 → 프록시**: `https://supermax.kr/maxai/imax-student-chat`
- **프록시 → n8n**: `https://n8n.sean8320.dedyn.io/webhook/imax-student-chat/chat`
- **API 인증**: `x-api-key: ilsan-max-ai-key-2024`

### 랜덤 뽑기 기능
- 참여자 이름 입력 → 1-99 주사위 점수 → 당첨자 발표
- UI: 입력창 위에 "랜덤 뽑기" 버튼 (다이스 모달)

---

## 서버 구조 (supermax/)

### 1. jungsi.js - 메인 서버 (포트 9090)

**역할**: Express 서버 진입점, API 라우팅, 인증 미들웨어

**주요 기능**:
- JWT 기반 인증 (`authMiddleware`, `authStudentOnlyMiddleware`)
- 공유 링크 생성/검증 (`authShareLinkMiddleware`)
- 레벨 시스템 (`addExpAndCheckLevelUp`)
- 학교 목록/상세 정보 API

**DB 연결**:
```javascript
const db = mysql.createPool({ database: 'jungsi' });        // 정시 데이터
const dbStudent = mysql.createPool({ database: 'jungsimaxstudent' });  // 학생 데이터
const dbSusi = mysql.createPool({ database: '26susi' });    // 수시 데이터 참조
```

**주요 API 엔드포인트**:
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/jungsi/schools/:year` | GET | 학년도별 전체 학교 목록 |
| `/jungsi/school-details` | POST | 학과 상세 정보 + 실기배점표 |
| `/jungsi/calculate` | POST | 정시 점수 계산 |
| `/silgi/calculate` | POST | 실기 점수 계산 |

### 2. ilsan-max.js - AI 프록시 서버 (포트 8321)

**역할**: n8n 챗봇 프록시 (CORS 우회)

**엔드포인트**:
| 경로 | 설명 |
|------|------|
| `/maxai/chat` | 일산맥스AI 챗봇 프록시 |
| `/maxai/imax-student-chat` | IMAX Student AI 챗봇 프록시 |
| `/maxai/api/universities/search` | 대학 검색 API |

---

## 클라이언트 구조 (imaxstudent/)

### index.html - 메인 프레임
- iframe 기반 SPA 구조
- 하단 네비게이션 바 (홈/대학찾기/저장대학/실기관리/AI/랭킹/MY)
- Service Worker 등록 (PWA)
- 버전 관리: `APP_VERSION` (변경 시 캐시 무효화)

### mypage.html - 마이페이지
**성적 입력**:
- 가채점: 원점수 입력
- 실채점: 표준점수, 백분위, 등급 입력
- **실채점 활성화**: `2025-12-05T09:00:00` 이후 (성적 발표일)

### imax_ai.html - AI 챗봇
- 다크 테마 (그라디언트 배경)
- 모바일 최적화
- 랜덤 뽑기 버튼 (입력창 위)
- 실기배점표 테이블 자동 변환

---

## 파일 목록

### 클라이언트 (imaxstudent/)
| 파일 | 설명 |
|------|------|
| index.html | 메인 프레임 (네비게이션, 버전 관리) |
| welcome.html | 홈 화면 |
| search.html | 대학 찾기 |
| saved_list.html | 저장된 대학 목록 |
| practical.html | 실기 기록 관리 |
| imax_ai.html | **AI 챗봇** (신규) |
| ranking.html | 랭킹 |
| mypage.html | 마이페이지 (성적 입력) |
| student_login.html | 학생 로그인 |
| n8n_imax_ai_workflow.json | **n8n 워크플로우** (신규) |
| manifest.json | PWA 매니페스트 |
| sw.js | Service Worker |
| claude.md | 프로젝트 문서 |

### 서버 (supermax/)
| 파일 | 설명 |
|------|------|
| jungsi.js | 메인 서버 (포트 9090) |
| jungsical.js | 정시 점수 계산 엔진 |
| silgical.js | 실기 점수 계산 엔진 |

### AI 서버 (ilsan-max-ai/)
| 파일 | 설명 |
|------|------|
| ilsan-max.js | AI 프록시 서버 (포트 8321) |

---

## 배포

### GitHub
- **Repo**: https://github.com/seanyjeong/ilsanmaxstudent

### 버전 업데이트 절차
1. `index.html`의 `APP_VERSION` 변경
2. `git add . && git commit && git push`
3. 서버 자동 배포 (또는 수동 `git pull`)

### n8n 워크플로우 업데이트
1. `n8n_imax_ai_workflow.json` 수정
2. n8n 웹 UI에서 기존 워크플로우 삭제
3. 새 JSON import
4. Gemini credential 연결
5. 워크플로우 활성화

---

## 중요 설정

### 실채점 탭 활성화
- **파일**: `mypage.html:496`
- **설정**: `new Date('2025-12-05T09:00:00')`
- 12월 5일 오전 9시 이후 자동 활성화

### Gemini API
- **모델**: `gemini-2.0-flash-exp`
- **API Key**: n8n credential에서 관리

---

*Last Updated: 2025-12-04*
