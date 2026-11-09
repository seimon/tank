// 데칼 셋: 내 탱크 포탑 좌우에 붙이는 그림 묶음. 타이틀에서 A/D(패드 방향키 ←→)로 고른다 (위장색 × 데칼 셋).
// 게임의 설정 메뉴(~ 키) → 타이틀 화면에서 '데칼 편집 모드'로 고친 뒤 C를 누르면 이 파일 내용 전체가 복사된다. 그대로 덮어 붙여 넣으면 된다.
//   name: 셋 이름 (타이틀에 보인다. 영어 대문자·숫자)
//   img: 그림 이름 = images/decals/의 PNG 파일 이름 (확장자 빼고). 그림을 고치거나 더하면 python tools/build.py (decal_images.js를 다시 만든다)
//   side: 1 = 왼쪽(탱크 기준) · -1 = 오른쪽     z: 앞뒤 위치 (m, 포탑 가운데 0, 앞이 +)     y: 높이 (m, 포탑 옆면 가운데 0)
//   rot: 돌림 (°, 바깥에서 볼 때 시계 반대 방향 +)     s: 세로 크기 (m. 가로는 그림 비율대로)
window.DECAL_SETS = [
  { name: '01', decals: [
    { img: 'decal_02', side: -1, z: -0.32, y: -0.36, rot: 0, s: 0.281 },
    { img: 'decal_02', side: 1, z: 0.32, y: -0.36, rot: 0, s: 0.281 },
    { img: 'decal_05', side: -1, z: 0.18, y: 0.22, rot: 0, s: 0.566 },
    { img: 'decal_05', side: 1, z: -0.18, y: 0.22, rot: 0, s: 0.566 },
  ] },
  { name: '02', decals: [
    { img: 'decal_c_molly', side: -1, z: -0.28, y: -0.08, rot: 0, s: 1.246 },
    { img: 'decal_05', side: 1, z: -0.32, y: 0.32, rot: 0, s: 0.534 },
    { img: 'decal_09', side: -1, z: 0.4, y: 0.38, rot: 0, s: 0.566 },
    { img: 'decal_c_molly', side: 1, z: 0.4, y: -0.18, rot: 0, s: 1.014 },
    { img: 'decal_04', side: 1, z: -0.48, y: -0.52, rot: 0, s: 0.236 },
    { img: 'decal_07', side: -1, z: 0.62, y: -0.42, rot: 0, s: 0.448 },
  ] },
  { name: '03', decals: [
    { img: 'decal_10', side: -1, z: -0.7, y: 0.48, rot: 0, s: 0.316 },
    { img: 'decal_10', side: -1, z: 0.7, y: 0.48, rot: 0, s: 0.316 },
    { img: 'decal_10', side: 1, z: 0.7, y: 0.48, rot: 0, s: 0.316 },
    { img: 'decal_10', side: 1, z: -0.7, y: 0.48, rot: 0, s: 0.316 },
    { img: 'decal_07', side: 1, z: 0, y: 0.02, rot: 0, s: 0.803 },
    { img: 'decal_07', side: -1, z: 0, y: 0.02, rot: 0, s: 0.803 },
    { img: 'decal_10', side: -1, z: -0.7, y: -0.48, rot: 0, s: 0.316 },
    { img: 'decal_10', side: -1, z: 0.7, y: -0.48, rot: 0, s: 0.316 },
    { img: 'decal_10', side: 1, z: 0.7, y: -0.48, rot: 0, s: 0.316 },
    { img: 'decal_10', side: 1, z: -0.7, y: -0.48, rot: 0, s: 0.316 },
  ] },
  { name: '04', decals: [
    { img: 'decal_c_nao', side: -1, z: -0.28, y: -0.08, rot: 0, s: 1.246 },
    { img: 'decal_c_nao', side: 1, z: 0.2, y: -0.02, rot: 0, s: 1.4 },
    { img: 'decal_04', side: 1, z: -0.4, y: 0.48, rot: 0, s: 0.265 },
    { img: 'decal_03', side: 1, z: -0.6, y: 0.18, rot: 0, s: 0.236 },
    { img: 'decal_02', side: -1, z: 0.64, y: 0.02, rot: -90, s: 0.335 },
    { img: 'decal_03', side: -1, z: 0.3, y: 0.36, rot: -90, s: 0.265 },
  ] },
  { name: '05', decals: [
    { img: 'decal_08', side: 1, z: 0.44, y: -0.56, rot: 0, s: 0.223 },
    { img: 'decal_06', side: -1, z: 0.18, y: 0.12, rot: 0, s: 0.956 },
    { img: 'decal_05', side: 1, z: -0.24, y: 0.28, rot: 0, s: 0.6 },
    { img: 'decal_08', side: 1, z: -0.46, y: -0.56, rot: 0, s: 0.223 },
    { img: 'decal_04', side: -1, z: -0.4, y: -0.48, rot: 0, s: 0.265 },
    { img: 'decal_02', side: 1, z: 0.34, y: -0.3, rot: 0, s: 0.265 },
  ] },
  { name: '06', decals: [
    { img: 'decal_01', side: -1, z: 0.18, y: 0.06, rot: -15, s: 0.6 },
    { img: 'decal_01', side: 1, z: 0.14, y: 0.04, rot: 15, s: 0.6 },
  ] },
];
