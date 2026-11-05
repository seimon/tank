// 데칼 셋: 내 탱크 포탑 좌우에 붙이는 그림 묶음. 타이틀에서 A/D(패드 방향키 ←→)로 고른다 (위장색 × 데칼 셋).
// 게임의 설정 메뉴(` 키) → 타이틀 화면에서 '데칼 편집 모드'로 고친 뒤 C를 누르면 이 파일 내용 전체가 복사된다. 그대로 덮어 붙여 넣으면 된다.
//   name: 셋 이름 (타이틀에 보인다. 영어 대문자·숫자)
//   img: 그림 이름 = images/decals/의 PNG 파일 이름 (확장자 빼고). 그림을 고치거나 더하면 python tools/build.py (decal_images.js를 다시 만든다)
//   side: 1 = 왼쪽(탱크 기준) · -1 = 오른쪽     z: 앞뒤 위치 (m, 포탑 가운데 0, 앞이 +)     y: 높이 (m, 포탑 옆면 가운데 0)
//   rot: 돌림 (°, 바깥에서 볼 때 시계 반대 방향 +)     s: 크기 (m)
window.DECAL_SETS = [
  { name: 'NONE', decals: [
    { img: 'triangle', side: -1, z: -0.42, y: 0.26, rot: 0, s: 0.956 },
    { img: 'tally', side: -1, z: -0.54, y: -0.4, rot: 0, s: 0.6 },
    { img: 'chevron', side: -1, z: 0.58, y: 0.42, rot: 0, s: 0.475 },
    { img: 'num79', side: 1, z: -0.18, y: 0.08, rot: 0, s: 1.357 },
    { img: 'tally', side: 1, z: -0.62, y: -0.44, rot: 0, s: 0.475 },
    { img: 'tally', side: 1, z: -0.16, y: -0.44, rot: 0, s: 0.475 },
  ] },
  { name: 'NUMBER 79', decals: [
    { img: 'num79', side: 1, z: 0.12, y: 0.04, rot: 0, s: 0.8 },
    { img: 'num79', side: -1, z: 0.12, y: 0.04, rot: 0, s: 0.8 },
    { img: 'star', side: 1, z: -0.55, y: 0.08, rot: 0, s: 0.4 },
    { img: 'star', side: -1, z: -0.55, y: 0.08, rot: 0, s: 0.4 },
  ] },
  { name: 'WHITE STAR', decals: [
    { img: 'star_ring', side: 1, z: 0, y: 0, rot: 0, s: 0.8 },
    { img: 'star_ring', side: -1, z: 0, y: 0, rot: 0, s: 0.8 },
  ] },
  { name: 'LIGHTNING', decals: [
    { img: 'bolt', side: 1, z: 0.05, y: 0, rot: -8, s: 0.8 },
    { img: 'bolt', side: -1, z: 0.05, y: 0, rot: 8, s: 0.8 },
    { img: 'tally', side: 1, z: -0.6, y: 0.22, rot: 0, s: 0.36 },
  ] },
  { name: 'CAT SQUAD', decals: [
    { img: 'cat', side: 1, z: 0.12, y: 0.02, rot: 0, s: 0.66 },
    { img: 'cat', side: -1, z: 0.12, y: 0.02, rot: 0, s: 0.66 },
    { img: 'chevron', side: 1, z: -0.55, y: 0.05, rot: 0, s: 0.42 },
    { img: 'chevron', side: -1, z: -0.55, y: 0.05, rot: 0, s: 0.42 },
  ] },
  { name: 'UNIT MARK', decals: [
    { img: 'triangle', side: 1, z: 0.3, y: 0.04, rot: 0, s: 0.5 },
    { img: 'triangle', side: -1, z: 0.3, y: 0.04, rot: 0, s: 0.5 },
    { img: 'num79', side: 1, z: -0.35, y: 0.04, rot: 0, s: 0.5 },
    { img: 'num79', side: -1, z: -0.35, y: 0.04, rot: 0, s: 0.5 },
  ] },
];