/** доля себестоимости в цене меню */
export const craft_food_cost = 0.18;

/** стакан, который собираем в крафте */
export const craft_cup_ml = 500;

/** сколько миллилитров сверху оставляем пустыми */
export const craft_headspace_ml = 40;

export function menu_price_from_cost(cost: number) {
  if (!(cost > 0)) return 0;
  return Math.max(1, Math.round(cost / craft_food_cost));
}

/** что предложить, когда ингредиент только что кинули в табличку */
export function ingredient_actions(name: string, unit_label: string): string[] {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  if (/тапиок/.test(n)) return ['положить на дно стакана', 'засыпать', 'перемешать'];
  if (/желе|джус|болл/.test(n)) return ['выложить', 'положить на дно стакана', 'добавить сверху'];
  if (/сироп|концентр|пюре|розов/.test(n)) return ['добавить', 'размешать', 'налить'];
  if (/молоко|сливк|сырная|сгущ/.test(n)) return ['налить', 'взбить', 'добавить сверху'];
  if (/чай|матча|какао|таро|сахар|специ|смесь/.test(n)) return ['насыпать', 'заварить', 'размешать'];
  if (/лед|снег/.test(n)) return ['засыпать', 'положить сверху'];
  if (/стакан|крышк|трубоч|пленк|запай/.test(n)) return ['взять', 'закрыть стакан', 'вставить'];
  if (/моти|макарун/.test(n)) return ['положить сверху', 'подать рядом'];
  if (unit_label === 'мл') return ['налить', 'добавить', 'размешать'];
  if (unit_label === 'шт') return ['взять', 'положить'];
  return ['насыпать', 'добавить', 'размешать'];
}
