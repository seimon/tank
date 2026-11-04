# LITTLE IRON — 작업 안내

브라우저용 미니 탱크 게임 (Three.js, PS1 느낌의 저해상도·도트). 이 문서는 다른 계정·다른 AI가 이어서 작업할 때 먼저 읽는 안내다.
자주 바뀌는 세부(수치·문구)는 적지 않는다. 규칙·구조·시스템이 바뀔 때만 고친다.

## 작업 규칙 (꼭 지킬 것)
- **답변은 한국어.** 사용자에게 하는 말은 모두 한국어로.
- **버전:** 작업할 때마다 `src/template.html`의 `VERSION`을 0.0.001씩 올리고(끝자리 세 자리, 예 0.5.016 → 0.5.017), `BUILD`는 그날 날짜(YYYY-MM-DD)만. 큰 단계는 사용자가 정한다 (예 0.5.000).
- **성능 목표:** PC·맥·아이패드에서 60fps. CPU·GPU를 최대한 적게 쓴다. 기능을 넣을 때마다 비용을 따진다.
- **config.js는 사용자가 직접 고친다.** 사용자가 바꾼 값은 그대로 두고, 새 설정만 주석과 함께 추가한다.
- **file://로 열어도 동작해야 한다.** 그래서 로컬 ES 모듈(import)로 나누지 않는다 (아래 '구조').
- **index.html은 직접 고치지 않는다.** `src/`를 고치고 `python tools/build.py`로 합친다.
- 사용자에게 시안을 보여 줄 때는 `mockups/`에 `YYYYMMDD_` 접두어로 저장한다.
- 디자인 수치(여백 몇 칸 등)는 사용자가 아주 구체적으로 정한다. 임의로 바꾸지 말고, 정한 것이 있으면 따로 알린다.

## 구조
```
index.html          ← 자동 생성 (src/를 합친 결과). 직접 고치지 말 것
config.js           ← 사용자가 고치는 설정 (window.CONFIG)
src/template.html   ← head·CSS·HTML·설정 메뉴. VERSION/BUILD 여기. @GAME 자리에 게임 코드가 들어간다
src/00_core.js      ← 도트 글꼴(5x7 HUD 글꼴), 2D 늘리기(sharpDraw/sharpBlit), 디더 지우기, 로딩 화면, 기본 설정
src/10_world.js     ← 지형, 필드 상태(풀·불), 씬, 안개
src/11_props.js     ← 텍스처, 조명, 마을, 풍차, 다리, 전봇대, AO 굽기
src/20_objects.js   ← 탱크 모델, 금고, 잔해, 나무 상자
src/21_grass_fx.js  ← 풀(텍스처 카드 3종), 불 번짐, 파티클
src/30_combat.js    ← 탱크 물리, 포탄·폭발, 기관총, 충돌 박스
src/40_input_post.js← 입력, 성장(선택지 로직 포함), PS1 후처리, 화면 크기, 설정 메뉴 동작
src/50_title.js     ← 타이틀(등장 연출·카메라), HUD 켜고 끄기(syncHud), 끝 창 흐름(showEnd/respawn/restartGame)
src/60_audio.js     ← 소리 (WebAudio 즉석 합성, 파일 없음)
src/70_enemies.js   ← 적 탱크·자주포·지프 AI, 전투 진행
src/80_hud.js       ← 픽셀 HUD, 타이틀 그림
src/81_ui.js        ← 픽셀 UI(한글): 부품, 성장 선택지, 끝 창, 정보 창(일시정지), 확인 창
src/90_loop.js      ← tick, 로딩 퇴장, 일시정지·정지, 메인 루프(frame), 디버그 dbg
tools/build.py      ← src/*.js를 이름 순서대로 이어 붙여 index.html 생성 (--watch 지원)
fonts/galmuri11c.js ← 갈무리11 장체 비트맵 데이터 (OFL, fonts/LICENSE.txt). fonts/bdf2js.py로 BDF에서 변환
images/             ← 타이틀 도트 PNG (사용자가 직접 그림)
mockups/            ← 사용자에게 보여 준 시안 그림
```
- 모든 src/*.js는 **하나의 모듈 범위**를 나눠 쓴다. import/export 없이 앞 파일의 이름을 그대로 쓰고, **파일 이름 순서가 곧 실행 순서**다 (let/const는 선언 전에 쓰면 TDZ 오류).
- 브라우저 오류 줄 번호는 index.html 기준. 파일 경계에 `// ===== src/xx.js =====` 표시가 있다.

## 화면 구성
- 3D는 저해상도 렌더 타깃(rt, 세로 300줄 기본) → 후처리(외곽선·15비트 색·디더·회색조) → 샤프 바이리니어로 화면에 늘림.
- HUD(`80_hud.js`)와 픽셀 UI(`81_ui.js`)는 별도 2D 캔버스. 1칸 = 게임 화면 1픽셀 × hk(해상도 360줄마다 1배). 색 캔버스는 `hud.blend`(더하기)로 얹고, 그림자 캔버스를 밑에 깐다.
- **글꼴:** 영문 HUD는 5x7 글꼴(`fontDraw`), 한글 UI는 갈무리11 장체(`gfDraw`/`gfWidth`/`gfWrap`, 한글 7x11 글자·8칸 간격, 줄 높이 15). 한 화면 안에서 둘을 섞지 않는다.

## 픽셀 UI (`81_ui.js`)
- 화면 하나 = 객체 `{ draw(ui), click(id), tick(), busy(), win, passive }`. `uiShow(screen)`으로 바꾼다. 한 번에 화면 하나 (`UI.screen`).
- `win: true` = 가운데 창: 치지직하며 나타나고, 사라질 때 치지직 + 4x4 디더링(`popup.fadeTime`). 창이 떠 있으면(`winUp()`) 배경 회색조, HUD 꺼짐(치지직+디더링), 탱크 조작 막힘.
- 모든 화면은 `passive`: 화면을 덮지 않고, `ui.hit()`으로 등록한 영역을 누를 때만 클릭을 가로챈다 (마우스·터치).
- 부품: `ui.fill/box/dim/panelSq/text/textK/keyText/keyButton/clip/knock/hit`. 색은 창마다 config `popup.*Color`.
- 다시 그리기는 내용이 바뀔 때만 (`uiDirty()`).

## 일시정지와 정지 (`90_loop.js`)
- **정보 창 (ESC):** `paused`. 게임 시간은 멈추고 창·회색조 연출만 그린다. 멈춘 뒤에는 3D 장면을 다시 그리지 않는다(`pauseScene`). ESC 또는 [ESC] 계속하기로만 닫힌다. 탭: 탱크 성능 / 강화 기록 / 조종법 (Q·E·클릭, W/S·A/D 픽셀 스크롤).
- **정지 (포커스 잃음·탭 가려짐):** `suspended`. 루프 자체를 끈다(`renderer.setAnimationLoop(null)`). 화면 변화 없음, 돌아오면 그대로 이어감. 정보 창과는 별개.
- 전투 불능·적군 섬멸 창이 떠 있으면 ESC는 무시.

## 시험·시안 만드는 법
- 미리보기: `.claude/launch.json`의 `minitank` (python http.server 8123).
- 미리보기 창이 가려져 있으면 rAF가 거의 돌지 않는다. 시험할 때는 `src/90_loop.js`에 임시로 `window.__frame = frame` 같은 훅을 넣고 빌드해서 루프를 직접 돌린 뒤, **끝나면 반드시 지우고 다시 빌드**한다.
- 디버그: `window.dbg` (`dbg.tank`, `dbg.setOffer([...id])`, `dbg.setOfferRaw`, `dbg.offerPad`, `dbg.offerFreeze`, `dbg.holdPick`, `dbg.showClear`, `dbg.showPause`, `dbg.fillPickLog(n)`, `dbg.uiShot()` = HUD+UI를 게임 해상도 PNG data URL로).
- 설정 메뉴(` 키): 성장 선택지 표시, 10레벨 무작위 성장, 내 탱크 파괴, 적군 섬멸, 타이틀 화면으로 등.
- '새로 시작'은 `sessionStorage['littleIron.skipTitle']`로 타이틀을 건너뛴다 (시험할 때도 유용).

## 남은 일 / 생각해 둔 것
- 게임패드 전체 조작 (지금은 성장 선택지 방향키와 패드 표시만).
- 끝 창·정보 창의 패드 버튼 표시.
- 진짜 모듈 분리(import/export)는 http로만 열기로 정할 때 검토.
