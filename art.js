/* Crops remove transparent PNG padding; display sizes remain game-space values.
   Small decorative parts (wrappers, toppings, steam, straws) are not extra colliders. */
(function (root) {
  const ART = [
    { file: 'items/01_mint_candy.png', crop: [24,24,440,249], w: 45, h: 26 },
    { file: 'items/02_muffin.png', crop: [24,25,357,352], w: 39, h: 38, y: -2 },
    { file: 'items/03_macaron_blue.png', crop: [24,24,375,328], w: 50, h: 40 },
    { file: 'items/04_macaron_pink.png', crop: [24,24,378,324], w: 58, h: 46 },
    { file: 'items/05_macaron_green.png', crop: [24,24,370,324], w: 68, h: 54 },
    { file: 'items/06_popsicle.png', crop: [24,24,291,441], w: 62, h: 102, angle: -.38, y: 4 },
    { file: 'items/07_ice_cream.png', crop: [24,24,338,334], w: 80, h: 80, y: -3 },
    { file: 'items/08_cake.png', crop: [24,24,355,368], w: 98, h: 98, y: -12 },
    { file: 'items/09_coffee.png', crop: [24,24,382,373], w: 129, h: 119, x: 8, y: -17 },
    { file: 'items/10_bubble_milk_tea.png', crop: [24,24,275,437], w: 106, h: 148, y: -6 },
    { file: 'character/11_doctor_final.png', crop: [212,162,1410,1350], w: 152, h: 140, y: -2 }
  ];
  if (typeof module === 'object' && module.exports) module.exports = ART;
  else root.MorArt = ART;
})(typeof globalThis !== 'undefined' ? globalThis : this);
