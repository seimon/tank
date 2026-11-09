# LITTLE IRON — 작업 안내

브라우저용 미니 탱크 게임 (Three.js, PS1 느낌의 저해상도·도트). 이 문서는 다른 계정·다른 AI가 이어서 작업할 때 먼저 읽는 안내다.
자주 바뀌는 세부(수치·문구)는 적지 않는다. 규칙·구조·시스템이 바뀔 때만 고친다.

## 작업 규칙 (꼭 지킬 것)
- **답변은 한국어.** 사용자에게 하는 말은 모두 한국어로.
- **버전:** 작업할 때마다 `src/template.html`의 `VERSION`을 0.0.001씩 올리고(끝자리 세 자리, 예 0.5.016 → 0.5.017), `BUILD`는 그날 날짜(YYYY-MM-DD)만. 큰 단계는 사용자가 정한다 (예 0.5.000).
- **성능 목표:** PC·맥·아이패드에서 60fps. CPU·GPU를 최대한 적게 쓴다. 기능을 넣을 때마다 비용을 따진다.
- **config.js는 사용자가 직접 고친다.** 사용자가 바꾼 값은 그대로 두고, 새 설정만 주석과 함께 추가한다.
- 탱크 물리 메모: 탱크 중력은 `GT = G × physics.gravity`(포탄·부스러기는 `G` 그대로). 벽·물체에 붙어 거의 멈춘 평지에서는 궤도 마찰을 `physics.wallSlip`배로 줄인다(`physStep`의 `_ws`, 벽에 붙어 제자리 회전이 느린 문제). 경사면 아래로 끌리는 힘은 `physics.slopePull`배(법선 성분은 그대로, `physStep`). 마찰 한계는 땅을 누르는 힘에 비례해서 중력 배율을 올리면 마찰도 같이 세진다. 궤도 속도는 '공통 속도(W/S)'와 '좌우 차이(A/D)'로 나눠 따로 따라간다(달리다 W를 떼고 돌아도 회전이 바로 시작되도록). 달리던 반대 방향 키를 누르면 헛돌던 궤도를 실제 속도로 맞춘 뒤 `physics.brake`배로 줄인다(`physStep`). G키(`uprightTank` → `openHopSpot`): 주변 16방향 중 6m 넘게 열린 방향이 8개 미만이면 가장 트인 쪽으로 고른 자리까지의 절반만큼 45도 포물선으로 쏘아 올려(`hopUpright(.., move)`, 수평은 일정 속도·높이는 식 그대로, `updateFall`) 차체 방향 그대로 내려앉고, 이미 트여 있으면 제자리에서 위로. 떠오르는 순간에도 착지 연출(`landFx`), 세우면 남은 HP가 1이 된다.
- **file://로 열어도 동작해야 한다.** 그래서 로컬 ES 모듈(import)로 나누지 않는다 (아래 '구조').
- **index.html은 직접 고치지 않는다.** `src/`를 고치고 `python tools/build.py`로 합친다.
- 사용자에게 시안을 보여 줄 때는 `mockups/`에 `YYYYMMDD_` 접두어로 저장한다.
- 디자인 수치(여백 몇 칸 등)는 사용자가 아주 구체적으로 정한다. 임의로 바꾸지 말고, 정한 것이 있으면 따로 알린다.

## 구조
```
index.html          ← 자동 생성 (src/를 합친 결과). 직접 고치지 말 것
config.js           ← 사용자가 고치는 설정 (window.CONFIG)
decals.js           ← 데칼 셋 (window.DECAL_SETS): 포탑 좌우 그림 묶음. 데칼 편집 모드에서 C로 복사해 덮어쓴다
title_images.js     ← 자동 생성 (images/*.png를 build.py가 data URL로 담음: file://에서 CRT로 올릴 수 있게). 직접 고치지 말 것
decal_images.js     ← 자동 생성 (images/decals/*.png를 build.py가 data URL로 담음). 직접 고치지 말 것
map.js              ← 지도 데이터 (window.MAP_DATA): 나무 상자·탱크 잔해·벙커 자리. 맵 편집 모드에서 R로 복사해 덮어쓴다
src/template.html   ← head·CSS·HTML·설정 메뉴. VERSION/BUILD 여기. @GAME 자리에 게임 코드가 들어간다
src/00_core.js      ← 도트 글꼴(5x7 HUD 글꼴), 2D 늘리기(sharpDraw/sharpBlit), 디더 지우기, 로딩 화면, 기본 설정
src/10_world.js     ← 지형, 필드 상태(풀·불), 씬, 안개
src/10a_crt.js      ← CRT 표현 (설정 'CRT 표현', config crt): snapCRT '아케이드'를 그대로. 로딩·게임 화면 전체를 CRT로 (renderer 바로 뒤라 로딩에도 걸린다)
src/11_props.js     ← 텍스처, 조명, 마을, 풍차, 다리, 전봇대, AO 굽기
src/20_objects.js   ← 탱크 모델, 금고, 잔해, 나무 상자
src/21_grass_fx.js  ← 풀(텍스처 카드 3종), 불 번짐, 파티클
src/22_weather.js   ← 날씨: 비(GPU 선, 그리기 1번, 조명·안개 반영), 모래바람(바닥 모래 연기 입자), 물보라, 번개
src/23_decals.js    ← 데칼: 셋 읽기, 포탑 옆면에 붙이기(decalPose), 셋 바꾸기(setDecalSet)
src/30_combat.js    ← 탱크 물리(마찰·중력·후진 제동·충돌음은 config.js의 physics), 포탄·폭발, 기관총, 충돌 박스
src/40_input_post.js← 입력, 성장(선택지 로직 포함), PS1 후처리, 화면 크기, 설정 메뉴 동작
src/50_title.js     ← 타이틀(등장 연출·카메라), HUD 켜고 끄기(syncHud), 끝 창 흐름(showEnd/respawn/restartGame)
src/52_clear.js     ← 임무 완료 화면 (config clear): 카메라 전환·포즈·타이틀 조명·배경 디더링 지우기
src/60_audio.js     ← 소리 (WebAudio 즉석 합성, 파일 없음)
src/70_enemies.js   ← 적 탱크·자주포·지프 AI, 전투 진행
src/72_bunker.js    ← 벙커 사격·대미지·파괴 (모델·배치는 20_objects.js)
src/80_hud.js       ← 픽셀 HUD, 타이틀 그림
src/81_ui.js        ← 픽셀 UI(한글): 부품, 성장 선택지, 끝 창, 정보 창(일시정지), 확인 창, 작전 정보
src/82_dmgtext.js   ← 대미지 숫자 (config damageText, 설정 메뉴 버튼): dmgTextHit/Heal/Gold. 공격 자리가 쏜 탱크가 아니면 부르는 쪽이 dmgFromP를 넣는다
src/85_editor.js    ← 맵 편집 모드 (설정 메뉴 버튼)
src/86_decal_editor.js ← 데칼 편집 모드 (설정 메뉴 버튼, 타이틀에서만)
src/90_loop.js      ← tick, 로딩 퇴장, 일시정지·정지, 메인 루프(frame), 디버그 dbg
tools/build.py      ← src/*.js를 이름 순서대로 이어 붙여 index.html 생성 (--watch 지원). images/decals/*.png → decal_images.js도
fonts/galmuri11c.js ← 갈무리11 장체 비트맵 데이터 (OFL, fonts/LICENSE.txt). fonts/bdf2js.py로 BDF에서 변환
images/             ← 타이틀 도트 PNG (사용자가 직접 그림). images/decals/ = 데칼 그림 (32x32, 투명 배경)
mockups/            ← 사용자에게 보여 준 시안 그림
```
- 모든 src/*.js는 **하나의 모듈 범위**를 나눠 쓴다. import/export 없이 앞 파일의 이름을 그대로 쓰고, **파일 이름 순서가 곧 실행 순서**다 (let/const는 선언 전에 쓰면 TDZ 오류).
- 브라우저 오류 줄 번호는 index.html 기준. 파일 경계에 `// ===== src/xx.js =====` 표시가 있다.

## 화면 구성
- 3D는 저해상도 렌더 타깃(rt, 세로 300줄 기본) → 후처리(외곽선·15비트 색·디더·회색조) → 샤프 바이리니어로 화면에 늘림.
- HUD(`80_hud.js`)와 픽셀 UI(`81_ui.js`)는 별도 2D 캔버스. 1칸 = 게임 화면 1픽셀 × hk(해상도 360줄마다 1배). 색 캔버스는 `hud.blend`(더하기)로 얹고, 그림자 캔버스를 밑에 깐다.
- **글꼴:** 영문 HUD는 5x7 글꼴(`fontDraw`), 한글 UI는 갈무리11 장체(`gfDraw`/`gfWidth`/`gfWrap`, 한글 7x11 글자·8칸 간격, 줄 높이 15). 한 화면 안에서 둘을 섞지 않는다 (예외: 타이틀 우하단 키 안내는 한글 `titleKeyRows`, 80_hud.js. 첫 그리기는 한글 글꼴이 있는 81_ui.js 맨 끝).

## CRT 표현 (`10a_crt.js`)
- snapCRT(다른 작업 폴더의 shaders.js)의 '아케이드' 셋팅을 그대로 옮겼다 (방 반사만 뺌). 값은 config `crt`. 게임 상태와 따로 매 프레임 돈다: 일시정지로 게임 화면을 다시 그리지 않아도 `crtPresent()`만 부른다 (포커스를 잃어 루프가 멈출 때만 멈춤).
- 켜면 HUD·UI·대미지 숫자·타이틀 캔버스를 **게임 픽셀 크기**로 그리고(`layerScale`, 00_core.js) 화면에서는 숨긴다(`body.crt`). `finalPass()`가 3D(postRT) → 아래 묶음(HUD·대미지 숫자) → 위 묶음(UI 창·선택지·타이틀·로딩)을 각각 보통+더하기 레이어로 compRT(게임 해상도)에 합치고 (창은 늘 HUD·대미지 숫자 위. 일반 화면 z-index: HUD 2 · 대미지 숫자 3 · UI 5), prep(화면 폭 × 가상 스캔라인, 잔상용 두 벌) → crt 두 단계로 그린다. 스캔라인 수는 화면 높이 ÷ `lineSize`. 게임 캔버스(화면 비율 제한·Pixel Perfect) 안에서만.
- 레이어 캔버스는 WebGL로 올리므로 **오염되면 안 된다**: file://에서 PNG 파일을 그리면 오염되니 그림은 data URL로 (`imgSrc()`, title_images.js).
- 레이어는 바뀐 때만 다시 합친다: 새 화면 캔버스를 만들면 그리는 곳에서 `crtDirty = true`, sharpBlit으로 그리면 `CRT_LAYER`에 넣고, 쌓는 순서는 `crtLayers()`에 더한다.
- 화면 휨·테두리 때문에 마우스 좌표는 `crtPoint(x, y)`로 되짚는다 (UI 클릭·편집 모드).
- **캔버스 텍스처 크기:** three.js는 캔버스 텍스처를 처음 올린 크기로 잡아 두고 그 뒤로는 덮어쓰기만 한다. 캔버스 크기를 바꾸면 `texture.dispose()`로 새로 만들어야 한다 (안 하면 WebGL 오류만 나고 옛 그림이 남는다. 레이어는 `crtSize()`).
- CRT에서 오류가 나면 `crtFail()`이 CRT를 끄고 원래 화면으로 돌아간다 (로딩·게임이 멈추지 않게, 원인은 콘솔 `[CRT]`).
- 로딩 화면에도 건다: 그래서 renderer를 만든 10_world.js 바로 뒤 파일이고, 뒤 파일의 이름(postRT·HUD 캔버스·resize 등)은 함수 안에서만 쓴다. `crtOn`은 00_core.js가 처음에 읽고, 로딩 그림은 `drawLoading` → `crtLoadHook`. 그 전에는 화면이 검다.

## 복셀 안개 (40_input_post.js, config `voxelFog`, 설정 메뉴 버튼)
- 보류 중 (config `enabled: false`). 꺼져 있으면 텍스처·유체 격자를 만들지 않고(`vfInit()`은 처음 켤 때) 매 프레임 일도 없다. 후처리 셰이더에는 꺼진 분기로만 남아 있다.
- 후처리(`postMat`)에서 깊이로 보이는 자리를 되찾고, 카메라 쪽으로 `march`번 거슬러 올라가며 지나는 `cell` m 칸마다 짙기(3D 노이즈 × 땅에서 높이 × 걷힘)를 쌓는다 (단계 + 4x4 디더). 땅 높이는 지형 격자를 1m 텍스처(`VF_TEX`)로 한 번 굽는다.
- 걷힘은 GPU '흉내 유체'(`vfFluid` 128×128 두 벌, 보드 150m): r = 걷힘, gb = 흐름(m/s). `vfStep(dt)`(90_loop.js, 후처리 바로 전, 멈추면 안 돎)이 한 번 그려 흐름 따라 옮기기 → curl 노이즈 소용돌이 → 바람 쪽으로 가라앉음 → 밀기 → 다시 참. 압력 계산은 없다. 밀기: 내 탱크(매 프레임), 대포(`fireCannon`), 폭발(`explode` → `vfStamp`), 한 번짜리는 `vfPush()`. 행렬·시간은 `postMat.onBeforeRender`, 흐르는 시간은 `playTime`, 타이틀에서는 `titleK`로 숨김.

## 맵 셋팅·날씨
- config `map.presets` = 맵 셋팅 여러 벌 (안개·주광·하늘빛·바람·비·모래·번개). 코드에서는 `MAP_PRESETS`/`mapIdx`, 처음 값은 `MAP0`. 바꾸기는 `applyMapPreset(i)` (설정 메뉴 '맵 셋팅' 버튼). `ao`·`grassTrampleTime`은 공통 값이라 presets 밖.
- 날씨는 타이틀에서는 안 보이고 플레이로 넘어가면 나타난다 (`titleK`).
- 하늘에서 떨어지는 물체: `screen.dropFade`초 만에 땅에 닿는 높이(`DROP_H`)에서 떨어지고, `fadeIn(root)`로 나타나자마자 `screen.dropFadeIn`초 동안 재질을 디더 복제본(`fadeMat`)으로 바꿔 끼워 4x4 디더링으로 나타난다. 낙하산은 `attachChute`(착지하면 접히며 디더링으로 사라짐). 셰이더는 로딩 때 미리 컴파일.
- 내 탱크를 가리는 물체: `ps1()` 셰이더가 탱크 둘레 화면 원 안의 앞쪽 조각을 디더링으로 비운다 (`U.uOccP/uOccR`, config `camera.seeThrough`). 땅은 `userData.noOcc`로 뺀다.
- 새로 시작·첫 화면으로(`restartGame`): 바로 다시 읽지 않고 `leaveBegin()`(52_clear.js)이 검정 4x4 디더링으로 위에서 아래로 덮은 뒤 다시 읽는다 (`clear.leaveTime`. 게임 픽셀 캔버스 하나를 보통 화면에서는 맨 위에, CRT면 맨 위 레이어 `crtLeave`로. 일시정지 중에도 돈다).
- 사라지는 연출 공통: `ditherWipe(src, f, vOf)` = 아래에서 위로 쓸어 올리는 4x4 디더링 (로딩·타이틀).

- 폭풍우 전환: 남은 적(`enemyLeft()`)이 config `map.stormAt` 이하가 되면 `stormTick`(40_input_post.js, tick에서)이 `map.stormPreset` 셋팅으로 `stormTime`초에 걸쳐 섞어 바꾸고, 끝나면 `applyMapPreset`. 한 판에 한 번.

## HUD 나침반 (80_hud.js, config `hud.compass`)
- 상단 가운데 호 + 바깥에 카메라 방향 기준 N·E·W·S, 사이 점(호에서 1칸 바깥). 카메라 앞 `range`도 안의 각도를 보이는 호 길이에 같은 비율로 모은다. 화면에서 보이는 대로라 동 = -x (+z가 북일 때). 글자·표시는 좌우 끝에서 잘리지 않게 다 들어갈 때만 그린다.
- 호 안쪽에 늘 (정찰 성장 없음): 탱크·자주포 3x3 · 지프 2x2 · 벙커 4x4 그림(`BUNKER_ICON`). HUD 캔버스는 화면 폭만큼, 다시 그리기는 `compassState().key`가 바뀔 때만. 나침반 칸은 `hudRight`(성장 선택지 자리)에 넣지 않는다.

## 위장색·용어
- 위장색은 내 탱크만 (`20_objects.js`, config `camo`). 단색은 재질 색, 무늬는 탱크 기준 좌표를 정점에 구운 `aCamo`로 그린다 (셰이더 하나, `CAMO_U`로 바꿈). 타이틀에서 Q/E, 고른 것은 `localStorage['MightyMolly.camoName']`(이름).
- 적군 섬멸(`endState === 'clear'`)이면 결과 값을 잠근다(`rulesLocked`, 70_enemies.js): 대미지(`damageTank`·`damageBunker`)·골드(`goldGain`)·성장 선택지는 바뀌지 않고, 남은 지프는 AI를 끈다(`enemyAiOff`). 값이 바뀌는 새 코드를 만들면 `rulesLocked()`를 확인할 것. `worldFrozen`(월드 시간 정지)은 일시정지(ESC)에만 쓴다.
- **임무 완료 화면** (`52_clear.js`, config `clear`, 상태 `clearSeq`는 40_input_post.js): `showEnd('clear')` → `clearBegin()`. 카메라는 타이틀 → 플레이와 같은 식으로 임무 완료 카메라로 넘어가고(`clearUpdate`, 탱크를 화면 오른쪽으로 미는 건 `camera.setViewOffset`), 조명은 타이틀 조명 쪽으로(`applyEnv`가 `clearSeq.k`로 섞음), 포탑은 카메라 쪽 포즈, 차체는 같은 시간에 똑바로 세운다(방향은 그대로, 내 탱크 물리는 끔). 날씨(비·모래·소리)도 같은 시간에 서서히 끈다(`updateWeather`의 `wk`). 배경 지우기: 내 탱크만 `cutRT`에 따로 그리고(`clearRenderCut`, 카메라 레이어 3 = 탱크·바닥 `clrFloor`, 배경 단색) 후처리(`uCut`)가 아래에서 위로 4x4 디더링으로 그쪽으로 바꾼다 (외곽선도 cutRT 깊이로). **물체를 숨겨서 거르면 안 된다**: 그 안의 광원이 빠져 광원 수가 바뀌면 탱크 재질을 모두 다시 컴파일해 멈칫한다 (그래서 광원은 모두 레이어 3에도 넣는다). 바닥은 배경색 평면에 그림자·뒷등 빛·포구 섬광(`uFl`, 흉내)만 (빛을 받지 않음). 다 지우면(`clearHold()`) 장면은 그리지 않고 tick은 `clearTick`만: 탱크 포즈·대포(`firstShot`·`shotEvery`, `b.clearShot`: 아무것에도 맞지 않고 0.8초 뒤 사라짐, 먼지는 바닥 평면 높이에서)·파티클·포구 섬광·바닥 그림자 (그때 남은 파티클·포탄은 지운다). 번개·날씨 소리·대미지 숫자도 끈다. 글자는 창 틀 없이 좌상단 `clearUI` (81_ui.js, 작전 정보처럼 한 글자씩. `win: true`는 그대로라 조작 막힘·G/T 키·HUD 끔은 창과 같다).
- 섬멸 창 동안은 내 기관총 자동 사격도 멈춘다 (`updateMG`).
- 내 기관총 자동 조준 우선순위(`mgPick`): 지프 → 적 탱크·자주포 → 보급품 → 적 벙커(가장 나중). 벙커는 방어력이 적용되고 관통은 '철갑 기관총'이 있어야 하며, 쏘면 경보가 울린다.
- 공격 대상 상자는 **보급품** (골드 보급품 = 붉은 금고, 수리 보급품 = 초록 띠 상자). 코드 이름은 `targets`, `safeModel/repairModel`.

## 대미지 숫자 덧붙임
- 대상이 이 대미지로 터지면 숫자 아래에 `DESTROYED`(같은 색, 같은 방향, `f.oy`). '치명적인 명중'은 `CRITICAL 100`: 포탄을 쏠 때 정하고(`ball.crit`), 직격을 부르는 쪽이 `dmgCrit = true`를 넣는다 (dmgFromP와 같은 방식, 30_combat.js).

## 데칼
- 내 탱크 포탑 좌우에만 붙인다. 셋은 `decals.js`, 그림은 `images/decals/*.png` → `decal_images.js` (file://에서 PNG를 WebGL 텍스처로 못 올려서 JS에 담는다). 타이틀에서 A/D(패드 ←→)로 셋을 고르고 `localStorage['MightyMolly.decalSet']`(이름)에 기억.
- 데칼 편집 모드(`86_decal_editor.js`): 타이틀에서만. 배경을 숨기고 마우스 카메라. 1~n 붙이기(보이는 옆면), WASD·QE·RF, T 포탑 뒤집기(`titlePose`가 `decalFlip`을 따른다), A/D 셋, N 새 셋, C decals.js 복사.

## 지도 데이터·맵 편집
- `map.js`가 있으면 나무 상자·드럼통·모래주머니·잔해·벙커는 그 목록대로 (자동 배치는 난수 순서를 지키려고 돌린 뒤 지우고 바꾼다). 넣기·옮기기·지우기 함수는 `20_objects.js` (`addCrate/moveCrate/deleteCrate`, `moveWreck/deleteWreck`, `placeBunker/moveBunker/deleteBunker`, `placeSandbag/moveSandbag/deleteSandbag`).
- 드럼통은 나무 상자 목록(`crates`)에 `drum: true`로 함께 든다 (충돌·쌓기·부서짐 공유, 그리기만 `drumMesh`). 지도 물체 모델은 전역 `rand()`를 쓰지 않는다 (뒤 배치가 바뀌지 않게).
- 편집 모드(`85_editor.js`): 적 제거·AI 정지·탱크 조작 막힘·카메라 따라가기 끔. 키는 캡처 단계에서 모두 가로챈다. 선택 표시는 흰색 뒤집힌 껍데기(BackSide)를 한 번 더 그린다.

## 작전 정보
- 게임 시작 직후 `missionUI`(81_ui.js, config `mission`): 한 글자씩 나타났다가 치지직+디더링으로 사라지고, `endMission()`에서 HUD를 켠다 (`hudRevealT`).

## 성장
- 선택지 `GC.upgrades`, 효과 `UP_FX`. 한 번에 보이는 개수는 `tank.offerN`(기본 3, '폭넓은 선택'이면 4: 키 4·키패드 4 / 패드 방향키 ↓). 레어도 조건 `minLevel`·`perOffer` (`risky` = 위험, 단점은 `bad`). 
- 조합 보너스 `GC.combos` + `COMBO_FX`: 고른 순간 `checkCombos()`가 효과를 넣고 `comboQueue`에 쌓아, 선택지가 사라진 뒤 `curOffer.combo` 카드로 보인다 (강화 기록에도).
- 선택지는 다른 창에 밀려 끝나지 못해도 `holdOffer`/`nextOffer`가 거둔다 (고른 직후 죽어도 다음 선택지가 뜨게).

## 소리
- `60_audio.js`: `out`(전체 음량) ← `master`(게임 소리). 일시정지(정보·확인 창) 중에만 `sfx.game(false)`로 게임 소리를 끈다 (전투 불능·섬멸 창은 그대로). 브라우저가 멈춰 둔 소리는 `sfx.keepAlive()`가 매 프레임 다시 켠다. 타이틀 키 처리는 SPACE·Q·E만 막고 Ctrl+R 등은 통과. UI 소리 `sfx.ui('open'|'close'|'tab'|'button'|'combo')`는 `out`으로. 브라우저 규칙상 첫 입력 전에는 소리가 안 난다 (`sfx.unlock`).

## 픽셀 UI (`81_ui.js`)
- 화면 하나 = 객체 `{ draw(ui), click(id), tick(), busy(), win, passive }`. `uiShow(screen)`으로 바꾼다. 한 번에 화면 하나 (`UI.screen`).
- `win: true` = 가운데 창: 치지직하며 나타나고, 사라질 때 치지직 + 4x4 디더링(`popup.fadeTime`). 창이 떠 있으면(`winUp()`) 배경 회색조, HUD 꺼짐(치지직+디더링), 탱크 조작 막힘.
- 모든 화면은 `passive`: 화면을 덮지 않고, `ui.hit()`으로 등록한 영역을 누를 때만 클릭을 가로챈다 (마우스·터치).
- 부품: `ui.fill/box/dim/panelSq/text/textK/keyText/keyButton/clip/knock/hit`. 색은 창마다 config `popup.*Color`.
- 다시 그리기는 내용이 바뀔 때만 (`uiDirty()`).

## 일시정지와 정지 (`90_loop.js`)
- 확인 창 `confirmUI`는 `mode`로 둘을 같이 쓴다: 'title' = 첫 화면으로, 'reset' = 설정 모두 초기 값으로(`resetSettings()`, 설정 탭 [R]).
- 설정 켜기/끄기 값은 `loadOpt(k, 처음 값)`/`saveOpt`(00_core.js·40_input_post.js): 설정에서 바꾸면 기억하지만, config의 처음 값이 바뀌면(`MightyMolly.<k>.cfg`로 비교) 기억한 값을 버리고 config를 따른다. 브라우저 저장 키 접두어는 모두 `MightyMolly.` (한 곳만 바꾸면 저장한 값을 못 읽는다. 예전 `littleIron.` 값은 00_core.js가 처음에 한 번 옮긴다).
- **정보 창 (ESC):** `paused`. 게임 시간은 멈추고 창·회색조 연출만 그린다. 멈춘 뒤에는 3D 장면을 다시 그리지 않는다(`pauseScene`). ESC 또는 [ESC] 계속하기로만 닫힌다. 탭: 탱크 성능 / 강화 기록 / 조종법 / 설정 (Q·E·클릭, W/S·A/D 픽셀 스크롤. 설정 탭은 W/S 항목·A/D 값, 고른 항목 왼쪽 표시는 `>` 와 `-` 를 530ms마다 번갈아(키를 누르면 `>`부터, 멈춘 화면은 `pauseUI.wake()`가 깨움). 항목 목록은 `pauseUI.setRows()`: 소리 크기·보는 방향 기준·자동 카메라·화면 흔들림·패드 진동·대미지 숫자·화면 밝기. 값은 40_input_post.js의 set 함수들이 localStorage에 기억).
- **타이틀 메뉴 창:** 타이틀에서 키를 받기 시작한 뒤(`TITLE_DELAY`) ESC(패드 START)로 같은 정보 창을 연다 (`pauseUI.titleMode`): 조종법·설정 탭만(`tabIds()`), 설정 탭으로 열림, [T] 첫 화면으로 없음, [ESC] 닫기. 타이틀 키·클릭 처리(50_title.js, 캡처 단계)는 `paused`이면 창으로 넘긴다. 타이틀 그림(#title)은 창보다 아래(z 4).
- 자동 카메라(`camBack`): 마우스로 바꾼 카메라가 손을 뗀 뒤 2초가 지나면 기본 방향·거리로 EaseInOutCubic으로 돌아온다.
- **정지 (포커스 잃음·탭 가려짐):** `suspended`. 루프 자체를 끈다(`renderer.setAnimationLoop(null)`). 화면 변화 없음, 돌아오면 그대로 이어감. 정보 창과는 별개.
- 전투 불능·적군 섬멸 창이 떠 있으면 ESC는 무시.

## 시험·시안 만드는 법
- 미리보기: `.claude/launch.json`의 `minitank` (python http.server 8123).
- 셰이더 미리 컴파일은 `warmCompile()`(90_loop.js): 렌더 타깃 `rt`에 맞춰 컴파일한다 (캔버스 기준이면 출력 색 공간이 달라 전부 다시 컴파일된다). 새 재질·인스턴스 색 버퍼는 로딩 때 장면에 있어야 미리 컴파일된다. **`scene` 밖에서 따로 그리는 장면(궤도 자국 `stampScene`·`fadeScene` 등)은 warmCompile에 안 들어가므로** 90_loop.js 로딩 단계에서 그려질 렌더 타깃을 맞춰 `compileAsync`로 따로 미리 컴파일하고 끝날 때까지 기다린다 (안 하면 처음 쓰이는 순간 컴파일·링크를 기다리며 1초 넘게 멈춘다: 게임 시작 때 `updateTrackMap`에서 1.5초 멈춘 적 있음). 끊김 확인: `renderer.info.programs.length`가 게임 중에 늘면 그때 컴파일한 것.
- 그을음(`addScorchDecal`)은 건물이면 잘게 쪼개기 전 저해상도 사본(`group.userData.ray`)에 투영하고, 데칼 상자에 닿는 삼각형만 골라 계산한다(`decalCulled`). 잔해 그을음은 로딩 때 3벌 미리 만들어 잔해에 자식으로 붙인다(`WRECK_SCORCH`). 게임 중에 무거운 계산을 새로 넣을 때는 이렇게 미리 만들거나 저해상도로.
- 끊김 기록(`perfFrame`, 콘솔 `[끊김]`): 프레임 JS 전체 시간·그리기·새 셰이더 수·오래 걸린 단계·해상도·GPU 이름.
- 미리보기 창이 가려져 있으면 rAF가 거의 돌지 않는다. 시험할 때는 `src/90_loop.js`에 임시로 `window.__frame = frame` 같은 훅을 넣고 빌드해서 루프를 직접 돌린 뒤, **끝나면 반드시 지우고 다시 빌드**한다.
- 디버그: `window.dbg` (`dbg.tank`, `dbg.setOffer([...id])`, `dbg.setOfferRaw`, `dbg.offerPad`, `dbg.offerFreeze`, `dbg.holdPick`, `dbg.showClear`, `dbg.showPause`, `dbg.fillPickLog(n)`, `dbg.uiShot()` = HUD+UI를 게임 해상도 PNG data URL로).
- 설정 메뉴(~ 키, Shift+`): 성장 선택지 표시, 10레벨 무작위 성장, 내 탱크 파괴, 적군 섬멸, 타이틀 화면으로 등.
- '새로 시작'은 `sessionStorage['MightyMolly.skipTitle']`로 타이틀을 건너뛴다 (시험할 때도 유용).

## 게임패드
- `81_ui.js` `padPoll()`이 매 프레임(frame 맨 앞, 일시정지 중에도) 표준 배치 패드를 읽어 `pad`(40_input_post.js)에 아날로그 값을 채운다 (tick이 키보드·터치 값과 함께 쓴다). 버튼 하나짜리 동작은 `padKey(code)`로 키 입력을 만들어 보낸다 (`e.fromPad`, 누르고 있는 동작은 `padHold`). 창마다 버튼 배치는 padPoll 위 주석. 화면의 키 글자는 마지막 입력(`inputPad`, `setInputPad`)에 따라 `PK(키보드, 패드)`로 바로 바뀐다 (타이틀은 `drawTitleKeys`). 버튼 이름은 Xbox 기준 (PS 패드도 브라우저가 같은 자리로).
- 패드로 조작하면 시점은 늘 차체 방향(`camTurret()`). 진동은 `padRumble(strong, weak, ms)` (패드로 조작할 때만, 마지막에 만진 패드로): 폭발·피격·충돌·줍기에서 부른다.

## 남은 일 / 생각해 둔 것
- 정보 창 '조종법' 탭: 스크롤을 내리면 키보드·게임패드 조작법을 도트 그림으로 설명 (사용자가 나중에 하기로 함).
- 진짜 모듈 분리(import/export)는 http로만 열기로 정할 때 검토.
