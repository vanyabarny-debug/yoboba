/** общая сетка плиток кассы — без скролла, всё влезает в экран */

export function tile_grid(count: number): { cols: number; rows: number } {
  const n = Math.max(1, count);
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 1, rows: 2 };
  if (n <= 4) return { cols: 2, rows: Math.ceil(n / 2) };
  if (n <= 6) return { cols: 2, rows: Math.ceil(n / 2) };
  if (n <= 9) return { cols: 3, rows: Math.ceil(n / 3) };
  if (n <= 12) return { cols: 3, rows: Math.ceil(n / 3) };
  if (n <= 16) return { cols: 4, rows: Math.ceil(n / 4) };
  const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * сетка доски «в работе» / «готовые»:
 * до 12 карточек — фиксированные ячейки 4×3 (не растягивать 1–2 на весь экран);
 * больше — подстраиваем cols/rows под количество.
 */
export function board_tile_grid(count: number): { cols: number; rows: number } {
  const n = Math.max(1, count);
  if (n <= 12) return { cols: 4, rows: 3 };
  if (n <= 16) return { cols: 4, rows: 4 };
  if (n <= 20) return { cols: 5, rows: 4 };
  if (n <= 25) return { cols: 5, rows: 5 };
  const cols = Math.min(6, Math.ceil(Math.sqrt(n)));
  return { cols, rows: Math.ceil(n / cols) };
}

export type tile_color = { bg: string; fg: string; border: string };

/** фирменная палитра для карточек доски */
export const board_palette: tile_color[] = [
  { bg: '#FFE8E8', fg: '#D64545', border: '#FFC9C9' },
  { bg: '#E7EEFF', fg: '#0039A6', border: '#C5D4FF' },
  { bg: '#FFF1E3', fg: '#C45E1A', border: '#FFD7B0' },
  { bg: '#E6F6EF', fg: '#1B7A56', border: '#BFE8D4' },
  { bg: '#FFEAF1', fg: '#C23B6B', border: '#FFC2D4' },
  { bg: '#FFF8E8', fg: '#A67C00', border: '#FFE6A8' },
  { bg: '#EAF4FF', fg: '#1E5BD6', border: '#C2DCFF' },
  { bg: '#FFEDE6', fg: '#E85D3A', border: '#FFD0C0' },
  { bg: '#EEF0FF', fg: '#3D4DB7', border: '#D0D6FF' },
  { bg: '#F0F7E8', fg: '#4F7A22', border: '#D4E8B8' },
];

export function color_for_id(id: string): tile_color {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 17)) % 997;
  return board_palette[h % board_palette.length];
}
