import {
  new_id,
  type finance_state,
  type prep_step,
  type tech_card,
  type tech_card_size,
  type material,
} from '@/lib/finance/model';
import { backfill_step_ingredients, ingredients_from_steps } from '@/lib/finance/prep-steps';
import { type ttk_fill, type ttk_nutrition_row } from '@/lib/finance/ttk-document';

/** ½ ст.л. ≈ 7,5 мл ≈ 7,5 г */
export const ROSE_WATER_TBSP_HALF_G = 7.5;

/** лёд: 100 г на 500 мл во всех холодных напитках; 650 = ×1.3 → 130 г */
export const ICE_G_PER_500 = 100;

function n(
  p500: [string, string, string, string],
  p650?: [string, string, string, string]
): Record<string, ttk_nutrition_row> {
  const row = ([protein, fat, carbs, energy]: [string, string, string, string]): ttk_nutrition_row => ({
    protein,
    fat,
    carbs,
    energy,
  });
  const out: Record<string, ttk_nutrition_row> = { '500': row(p500) };
  if (p650) out['650'] = row(p650);
  else
    out['650'] = row([
      String(Math.round(Number(p500[0].replace(',', '.')) * 1.3 * 10) / 10),
      String(Math.round(Number(p500[1].replace(',', '.')) * 1.3 * 10) / 10),
      String(Math.round(Number(p500[2].replace(',', '.')) * 1.3 * 10) / 10),
      p500[3],
    ]);
  return out;
}

function step(
  title: string,
  hint: string,
  qty: number,
  materialId?: string,
  extra?: { when?: 'cold' | 'hot'; qty_label?: string }
): prep_step {
  return {
    id: new_id('step'),
    title,
    hint,
    qty,
    ...(materialId ? { materialId } : {}),
    ...(extra?.when ? { when: extra.when } : {}),
    ...(extra?.qty_label ? { qty_label: extra.qty_label } : {}),
  };
}

const STORAGE_TEA =
  'Вареная тапиока — до 4 часов при +18…+25 °C; чайная база — до 12 часов при +2…+6 °C; молоко/сливки после вскрытия — до 36 часов при +2…+6 °C; лёд — до готовки, хранить при −18 °C.';
const STORAGE_LEMONADE =
  'Джус-болы и желе после вскрытия — до 72 часов при +2…+6 °C; газированная вода — в герметичной таре при +2…+8 °C; сиропы/концентраты — по маркировке; лёд — при −18 °C.';
const STORAGE_MILK =
  'Молоко и сливки после вскрытия — до 36 часов при +2…+6 °C; джус-болы/желе — до 72 часов при +2…+6 °C; сиропы — по маркировке; лёд — при −18 °C.';

const SERVE_COLD = 'со льдом, 4–8 °C';
const SERVE_HOT = '60–65 °C';
const SERVE_DUAL = 'холодный — со льдом, 4–8 °C; горячий — 60–65 °C';

export type ttk_preset = {
  /** граммовки на 500 мл; сумма ингредиентных шагов = 500 г */
  steps: prep_step[];
  ttk: ttk_fill;
};

/**
 * пресеты: граммы в шагах = граммы в рецептуре (500 мл).
 * лёд всегда 100 г / 500 мл (холодные); входит в баланс массы до 500 г.
 */
const BY_KEY: Record<string, () => ttk_preset> = {
  'original-black-led': () => ({
    // 50+45+220+85+100 = 500
    steps: [
      step('тапиока вареная', 'выложить на дно стакана', 50, 'tapioca'),
      step('сироп «чёрный сахар»', 'добавить и распределить по стенкам вращательным движением', 45, 'syrup_brown_sugar'),
      step('чайная база (чёрный чай)', 'отмерить в шейкер (охлаждённая)', 220, 'tea_black'),
      step('молоко питьевое 3,2%', 'налить в шейкер', 85, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'интенсивно взбивать 10–15 сек до лёгкой пены и охлаждения', 0),
      step('сборка и подача', 'перелить вместе со льдом в стакан; запаять / закрыть крышкой; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан с герметичной крышкой/плёнкой. На дне — слой тапиоки, на стенках — карамельные разводы. Верхний слой — эмульсия чая и молока со льдом.',
      color: 'Светло-коричневый, молочно-карамельный.',
      taste:
        'Насыщенный вкус чёрного чая с нотами карамельного сахара и молока. Без посторонних привкусов.',
      consistency: 'Напиток — жидкий, со льдом; шарики тапиоки — плотные, упругие, жевательные.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_TEA,
      nutrition: n(['2,3', '2,1', '58,5', '262 / 1096'], ['3,0', '2,7', '76,0', '340 / 1423']),
    },
  }),

  'jasmine-green-led': () => ({
    // 50+40+220+90+100 = 500
    steps: [
      step('тапиока вареная', 'выложить на дно стакана', 50, 'tapioca'),
      step('сироп «чёрный сахар»', 'добавить и распределить по стенкам', 40, 'syrup_brown_sugar'),
      step('чайная база (жасминовый зелёный)', 'отмерить в шейкер (охлаждённая)', 220, 'tea_jasmine'),
      step('молоко питьевое 3,2%', 'налить в шейкер', 90, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'интенсивно взбивать 10–15 сек до лёгкой пены', 0),
      step('сборка и подача', 'перелить вместе со льдом в стакан; запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан с плёнкой/крышкой. На дне — слой тапиоки, на стенках — разводы от сиропа. Верхняя часть — эмульсия чая и молока со льдом.',
      color: 'Светло-кремовый с нежным карамельно-золотистым оттенком.',
      taste:
        'Вкус зелёного чая с цветочным ароматом жасмина, сбалансированный карамельным сиропом и молоком.',
      consistency: 'Напиток — жидкий, со льдом; шарики тапиоки — плотные, упругие, жевательные.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_TEA,
      nutrition: n(['2,3', '2,1', '58,5', '262 / 1096'], ['3,0', '2,7', '76,0', '340 / 1423']),
    },
  }),

  'tropichesky-limonad': () => ({
    // 10+35+100+15+25+315 = 500
    steps: [
      step('сироп «блю кюрасао» (нижний слой)', 'внести на дно стакана', 10, 'syrup_curacao'),
      step('джус-болы «маракуйя»', 'выложить на дно', 35, 'jb_passion'),
      step('лёд пищевой', 'заполнить стакан', ICE_G_PER_500, 'ice'),
      step('желе «личи»', 'аккуратно выложить поверх льда', 15, 'jelly_lychee'),
      step('газированная вода', 'заполнить оставшееся пространство', 315, 'soda'),
      step('сироп «блю кюрасао» (верхний слой)', 'внести сверху для слоистого эффекта', 25, 'syrup_curacao'),
      step('подача', 'запаять / закрыть купольной крышкой; трубочка от 12 мм; реализовать сразу (газация)', 0),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан со слоистой структурой и пузырьками. На дне — синий слой сиропа и джус-болы маракуйя, в средней части — лёд и желе личи, верх — голубой газированный напиток.',
      color: 'Ярко-голубой, бирюзовый, с контрастными включениями топпингов.',
      taste:
        'Освежающий тропический вкус с нотами маракуйи, личи, цитрусовыми оттенками Кюрасао и газированной колкостью.',
      consistency:
        'Напиток — жидкий, со льдом и газом; джус-болы — сочные, лопающиеся; желе — плотное, упругое.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_LEMONADE,
      nutrition: n(['0,1', '0,0', '39,2', '157 / 655'], ['0,1', '0,0', '51,0', '204 / 852']),
    },
  }),

  'matcha-latte-tiger': () => ({
    // 50+40+7+20+248+35+100 = 500 (вода для разведения матчи + лёд 100 г)
    steps: [
      step('тапиока вареная', 'выложить на дно стакана', 50, 'tapioca'),
      step('сироп «чёрный сахар»', 'добавить, распределить по стенкам', 40, 'syrup_brown_sugar'),
      step('матча (порошок)', 'отмерить', 7, 'matcha'),
      step('вода (фильтрованная)', 'взбить с матчей до однородности (для холодного — комнатной t°)', 20, 'water'),
      step('молоко', 'налить в шейкер / питчер', 248, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер (только холодный)', ICE_G_PER_500, 'ice'),
      step('смешивание', 'соединить матчу с молоком; горячий — прогреть до 65–70 °C без кипения', 0),
      step('сырная шапка', 'выложить сверху', 35, 'cheese_foam'),
      step('подача', 'закрыть крышкой; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Стакан с тапиокой на дне, молочно-матча слоем и сырной шапкой сверху. Для горячего — термостойкий стакан с крышкой.',
      color: 'Насыщенный зелёный матча с кремовой шапкой и карамельными разводами.',
      taste: 'Яркий вкус матчи с молочной мягкостью, карамельным сиропом и сливочной сырной шапкой.',
      consistency: 'Напиток — умеренно густой; тапиока — жевательная; шапка — воздушная, кремовая.',
      serveTemp: SERVE_DUAL,
      storage: STORAGE_TEA,
      nutrition: n(['4,2', '6,8', '48,0', '270 / 1130'], ['5,5', '8,8', '62,0', '350 / 1464']),
    },
  }),

  /** горячий матча с желе личи */
  'matcha-lichi': () => ({
    steps: [
      step('желе «личи»', 'выложить на дно термостойкого стакана', 50, 'jelly_lychee'),
      step('матча (порошок)', 'отмерить', 7, 'matcha'),
      step('вода (фильтрованная)', 'взбить с матчей до однородности', 20, 'water'),
      step('молоко', 'налить в питчер', 413, 'milk'),
      step('прогрев', 'прогреть матчу с молоком до 65–70 °C без кипения, выход ~490 г', 0),
      step('сборка и подача', 'перелить к желе; закрыть термостойкой крышкой', 0),
    ],
    ttk: {
      appearance:
        'Термостойкий стакан с кубиками желе «личи» на дне и однородным горячим молочно-матча слоем.',
      color: 'Приглушённый оливково-зелёный матча, однородный.',
      taste: 'Яркий вкус матчи с молочной мягкостью и лёгкой сладостью желе личи.',
      consistency: 'Напиток — умеренно густой, горячий; желе — упругие прозрачные кубики.',
      serveTemp: SERVE_HOT,
      storage: STORAGE_TEA,
      nutrition: n(['4,0', '5,5', '42,0', '245 / 1025'], ['5,2', '7,2', '54,5', '318 / 1331']),
    },
  }),

  taro: () => ({
    // 500 мл: 50+310+50+25+50; лёд 100 г только в холодном
    steps: [
      step('тапиока вареная', 'выложить на дно стакана заранее', 50, 'tapioca'),
      step('молоко', 'холодный — в шейкер; горячий — в питчер', 310, 'milk'),
      step('пюре «таро»', 'добавить к молоку', 50, 'taro_mix'),
      step('сироп', 'добавить к молоку и пюре', 25),
      step('краситель', 'капнуть в смесь, 9 капель', 0, undefined, { qty_label: '9 капель' }),
      step(
        'лёд',
        'в шейкер вместе с молоком, пюре, сиропом и красителем',
        ICE_G_PER_500,
        'ice',
        { when: 'cold' }
      ),
      step(
        'взбивание',
        'взбить в шейкере со льдом до однородности и холода',
        0,
        undefined,
        { when: 'cold' }
      ),
      step(
        'прогрев',
        'в питчере помешивать на индукции, мощность 600, до 60 °C. Если на улице очень холодно — до 70 °C. Не кипятить',
        0,
        undefined,
        { when: 'hot' }
      ),
      step('сборка', 'вылить смесь в стакан, где уже лежит тапиока', 0),
      step('сырная шапка', 'залить сверху отдельно, не смешивать с напитком', 50, 'cheese_foam'),
      step('подача', 'закрыть крышкой, широкая трубочка', 0),
    ],
    ttk: {
      appearance:
        'Один стакан: тапиока на дне, лиловый таро и сырная шапка сверху отдельно. Холодный — из шейкера со льдом, горячий — из питчера.',
      color: 'Характерный сиренево-лиловый цвет таро с белой сырной шапкой.',
      taste: 'Сладковатый орехово-ванильный вкус таро с молоком, сиропом и сливочной шапкой.',
      consistency: 'Напиток густой; тапиока жевательная; шапка воздушная и не смешана с напитком.',
      serveTemp: 'холодный — со льдом, 4–8 °C; горячий — 60 °C, в сильный мороз — 70 °C',
      storage: STORAGE_MILK,
      nutrition: n(['3,8', '7,2', '52,0', '290 / 1213'], ['4,9', '9,4', '67,5', '377 / 1577']),
    },
  }),

  'vanilny-milktea': () => ({
    steps: [
      step('тапиока вареная', 'выложить на дно стакана', 50, 'tapioca'),
      step('сироп «чёрный сахар»', 'нарисовать лёгкие разводы по стенкам (~10 г)', 10, 'syrup_brown_sugar'),
      step('сироп «ванильный»', 'внести в шейкер (~4 пшика помпой)', 40, 'syrup_vanilla'),
      step('молоко питьевое 3,2%', 'налить в шейкер', 390, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'интенсивно взбивать 10–15 сек до пены и охлаждения', 0),
      step('сборка и подача', 'перелить из шейкера в стакан к тапиоке; запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан с тапиокой на дне, лёгкими разводами и кремово-ванильной молочной эмульсией со льдом.',
      color: 'Светло-кремовый / ванильно-молочный.',
      taste: 'Мягкий ванильный милкти с лёгкой нотой чёрного сахара и жевательной тапиокой.',
      consistency: 'Напиток — жидкий, со льдом и пенкой; тапиока — упругая.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_TEA,
      nutrition: n(['3,2', '3,5', '52,0', '255 / 1067'], ['4,2', '4,6', '67,5', '332 / 1389']),
    },
  }),

  'cherny-karamel-led': () => ({
    steps: [
      step('тапиока вареная', 'выложить на дно стакана', 50, 'tapioca'),
      step('топинг «карамель»', 'нарисовать разводы по стенкам (~10 г)', 10, 'topping_caramel'),
      step('сироп «карамельный»', 'внести в шейкер (вместо чёрного сахара)', 45, 'syrup_caramel'),
      step('чайная база (чёрный чай)', 'отмерить в шейкер (охлаждённая)', 220, 'tea_black'),
      step('молоко питьевое 3,2%', 'налить в шейкер', 85, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'интенсивно взбивать 10–15 сек до лёгкой пены', 0),
      step('сборка и подача', 'перелить в стакан к тапиоке; запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Стакан с тапиокой, карамельными разводами на стенках и молочно-чайной эмульсией со льдом.',
      color: 'Светло-карамельный молочный с золотистыми разводами.',
      taste: 'Чёрный чай с молоком и яркой карамелью, лёгкая пенка после шейкера.',
      consistency: 'Напиток — жидкий, со льдом; тапиока — жевательная.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_TEA,
      nutrition: n(['2,3', '2,1', '58,0', '260 / 1088'], ['3,0', '2,7', '75,5', '338 / 1414']),
    },
  }),

  'cherny-karamel': () => ({
    steps: [
      step('тапиока вареная', 'выложить на дно термостойкого стакана', 50, 'tapioca'),
      step('топинг «карамель»', 'нарисовать разводы по стенкам (~10 г)', 10, 'topping_caramel'),
      step('сироп «карамельный»', 'внести в питчер', 45, 'syrup_caramel'),
      step('чайная база (чёрный чай)', 'налить в питчер', 220, 'tea_black'),
      step('молоко питьевое 3,2%', 'добавить в питчер', 165, 'milk'),
      step('прогрев', 'прогреть молоко с сиропом и чаем до 65–70 °C, не кипятить', 0),
      step('сборка и подача', 'перелить к тапиоке с рисунком; выход ~490 г; закрыть термостойкой крышкой', 0),
    ],
    ttk: {
      appearance:
        'Термостойкий стакан с тапиокой, карамельным рисунком на стенках и горячей молочно-чайной основой.',
      color: 'Тёплый карамельно-молочный с золотистыми разводами.',
      taste: 'Горячий чёрный чай с молоком и карамелью, мягкое послевкусие.',
      consistency: 'Напиток — жидкий, горячий; тапиока — мягкая, жевательная.',
      serveTemp: SERVE_HOT,
      storage: STORAGE_TEA,
      nutrition: n(['2,5', '2,4', '55,0', '255 / 1067'], ['3,3', '3,1', '71,5', '332 / 1389']),
    },
  }),

  kakao: () => ({
    // 18+20+320+42+100 = 500
    steps: [
      step('какао-порошок', 'развести с частью молока до однородности', 18, 'cocoa'),
      step('сироп «шоколадный»', 'добавить', 20, 'syrup_chocolate'),
      step('молоко', 'долить; горячий — прогреть до 65–70 °C; холодный — со льдом', 320, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер (только холодный)', ICE_G_PER_500, 'ice'),
      step('сырная шапка', 'выложить сверху', 42, 'cheese_foam'),
      step('подача', 'закрыть крышкой; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance: 'Стакан с однородным какао и сырной шапкой сверху; для горячего — термостойкий стакан.',
      color: 'Насыщенный шоколадный коричневый с белой кремовой шапкой.',
      taste: 'Выраженный вкус какао с молочной мягкостью и сливочной шапкой. Без горечи и посторонних привкусов.',
      consistency: 'Напиток — умеренно густой, однородный; шапка — воздушная.',
      serveTemp: SERVE_DUAL,
      storage: STORAGE_MILK,
      nutrition: n(['5,0', '9,5', '42,0', '275 / 1151'], ['6,5', '12,4', '54,5', '357 / 1494']),
    },
  }),

  'masala-chai': () => ({
    // горячий без льда: 50+281+56+4+42+67 water? = need 500
    // 50+281+56+4+42 = 433, +67 water = 500
    steps: [
      step('тапиока вареная', 'выложить на дно термостойкого стакана', 50, 'tapioca'),
      step('чайная база (чёрный чай)', 'налить в питчер', 281, 'tea_black'),
      step('сливки 10%', 'добавить в питчер', 56, 'cream'),
      step('специи (масала)', 'внести в смесь', 4, 'spices'),
      step('вода (фильтрованная)', 'довести объём смеси при необходимости', 67, 'water'),
      step('прогрев', 'на индукции/стимере до 65–70 °C, помешивая, не кипятить', 0),
      step('сборка', 'перелить в стакан поверх тапиоки', 0),
      step('сырная шапка', 'выложить сверху', 42, 'cheese_foam'),
      step('подача', 'закрыть термостойкой крышкой; трубочка для горячего', 0),
    ],
    ttk: {
      appearance:
        'Термостойкий стакан с тапиокой на дне, горячей пряной молочно-чайной основой и сырной шапкой.',
      color: 'Тёплый бежево-карамельный с кремовой шапкой.',
      taste: 'Пряный чёрный чай с нотами масалы, сливочной мягкостью и лёгкой сладостью.',
      consistency: 'Умеренно густой, обволакивающий; тапиока — мягкая, жевательная, горячая.',
      serveTemp: SERVE_HOT,
      storage: STORAGE_TEA,
      nutrition: n(['4,8', '12,0', '38,0', '280 / 1172'], ['6,2', '15,6', '49,0', '364 / 1523']),
    },
  }),

  'medovy-tykvenny-latte': () => ({
    // 500 мл, только горячий: 50+310+50+25+50
    steps: [
      step('тапиока вареная', 'выложить на дно стакана заранее', 50, 'tapioca'),
      step('молоко', 'налить в питчер', 310, 'milk'),
      step('пюре тыквы', 'добавить в питчер к молоку', 50, 'pumpkin_puree'),
      step('сироп', 'добавить в питчер', 25),
      step('краситель', 'капнуть в питчер, 9 капель', 0, undefined, { qty_label: '9 капель' }),
      step(
        'прогрев',
        'помешивая, на индукции мощность 600 до 60 °C. Если на улице очень холодно — до 70 °C. Не кипятить',
        0
      ),
      step('сборка', 'вылить всё из питчера в стакан, где уже лежит тапиока', 0),
      step('сырная шапка', 'залить сверху отдельно, не греть и не смешивать с напитком', 50, 'cheese_foam'),
      step('подача', 'закрыть крышкой, широкая трубочка', 0),
    ],
    ttk: {
      appearance:
        'Термостойкий стакан: тапиока на дне, тыквенный латте из питчера и сырная шапка сверху отдельно.',
      color: 'Мягкий тыквенно-персиковый с белой сырной шапкой.',
      taste: 'Тыква с молоком и сиропом, сливочная шапка.',
      consistency: 'Напиток однородный, горячий; тапиока жевательная; шапка воздушная и не смешана.',
      serveTemp: '60 °C, в сильный мороз — 70 °C',
      storage: STORAGE_MILK,
      nutrition: n(['4,0', '7,5', '40,0', '250 / 1046'], ['5,2', '9,8', '52,0', '325 / 1360']),
    },
  }),

  'klubnichny-limonad': () => ({
    // 45+45+100+310 = 500
    steps: [
      step('концентрат клубники', 'внести на дно стакана', 45, 'conc_strawberry'),
      step('джус-болы «клубника»', 'выложить на дно', 45, 'jb_strawberry'),
      step('лёд пищевой', 'заполнить стакан', ICE_G_PER_500, 'ice'),
      step('газированная вода', 'заполнить до верха', 310, 'soda'),
      step('подача', 'запаять / закрыть купольной крышкой; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан с клубничным слоем и джус-болами на дне, льдом и розово-красной газированной основой.',
      color: 'Ярко-розовый / красный с блеском газа.',
      taste: 'Освежающий клубничный вкус с лёгкой кислинкой и газированной колкостью.',
      consistency: 'Напиток — жидкий, со льдом и газом; джус-болы — сочные, лопающиеся.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_LEMONADE,
      nutrition: n(['0,2', '0,0', '36,0', '145 / 607'], ['0,3', '0,0', '47,0', '188 / 787']),
    },
  }),

  'ananas-marakuya': () => ({
    // 45+45+100+310 = 500, как у клубничного лимонада
    steps: [
      step('концентрат ананаса', 'внести на дно стакана', 45, 'conc_pineapple'),
      step('джус-болы «маракуйя»', 'выложить на дно', 45, 'jb_passion'),
      step('лёд пищевой', 'заполнить стакан', ICE_G_PER_500, 'ice'),
      step('газированная вода', 'заполнить до верха', 310, 'soda'),
      step('подача', 'запаять / закрыть купольной крышкой; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан с ананасовым слоем и джус-болами маракуйи на дне, льдом и жёлтой газированной основой.',
      color: 'Ярко-жёлтый с блеском газа.',
      taste: 'Освежающий ананасовый вкус с маракуйей, лёгкой кислинкой и газированной колкостью.',
      consistency: 'Напиток — жидкий, со льдом и газом; джус-болы — сочные, лопающиеся.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_LEMONADE,
      nutrition: n(['0,2', '0,0', '36,0', '145 / 607'], ['0,3', '0,0', '47,0', '188 / 787']),
    },
  }),

  'nezhnaya-roza': () => ({
    // 42+50+7.5+300.5+100 = 500
    steps: [
      step('концентрат клубники', 'внести на дно стакана', 42, 'conc_strawberry'),
      step('джус-болы «клубника»', 'выложить на дно', 50, 'jb_strawberry'),
      step('розовая вода', 'добавить ½ ст. л. (7,5 г)', ROSE_WATER_TBSP_HALF_G, 'rose_water'),
      step('молоко', 'налить в шейкер', 300.5, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'взбивать 8–12 сек до охлаждения', 0),
      step('сборка и подача', 'перелить в стакан; запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance: 'Прозрачный стакан с клубничными джус-болами на дне и нежно-розовой молочной эмульсией со льдом.',
      color: 'Нежно-розовый, молочный.',
      taste: 'Мягкий клубнично-молочный вкус с лёгким цветочным ароматом розы (½ ст. л. розовой воды на 500 мл).',
      consistency: 'Напиток — жидкий, со льдом; джус-болы — сочные, упругие.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_MILK,
      nutrition: n(['3,0', '3,2', '42,0', '210 / 879'], ['3,9', '4,2', '54,5', '273 / 1142']),
    },
  }),

  'malinovy-yogurt': () => ({
    // 30+50+295+25+100 = 500
    steps: [
      step('джус-болы «йогурт»', 'выложить на дно стакана', 50, 'jb_yogurt'),
      step('сироп «малина»', 'нарисовать разводы по стенкам стакана (~30 г)', 30, 'syrup_raspberry'),
      step('молоко', 'налить в шейкер', 295, 'milk'),
      step('сгущённое молоко', 'добавить в шейкер', 25, 'condensed'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'взбивать 10–15 сек до однородности и лёгкой пены', 0),
      step('сборка и подача', 'перелить в стакан к джус-болам; запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance:
        'Стакан с йогуртными джус-болами на дне, малиновыми разводами на стенках и нежно-розовой молочной эмульсией со льдом и пенкой.',
      color: 'Нежно-розовый с яркими малиновыми разводами на стенках.',
      taste: 'Сливочно-йогуртный вкус с яркой малиной и лёгкой сладостью сгущёнки.',
      consistency: 'Напиток — жидкий, со льдом; джус-болы — сочные, лопающиеся.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_MILK,
      nutrition: n(['3,5', '4,0', '48,0', '240 / 1004'], ['4,6', '5,2', '62,0', '312 / 1305']),
    },
  }),

  'tropichesky-mango': () => ({
    // 70+28+302+100 = 500
    steps: [
      step('джус-болы «манго»', 'выложить на дно стакана', 70, 'jb_mango'),
      step('желе «личи»', 'добавить поверх / рядом', 28, 'jelly_lychee'),
      step('молоко', 'налить в шейкер', 302, 'milk'),
      step('лёд пищевой', 'засыпать в шейкер', ICE_G_PER_500, 'ice'),
      step('взбивание', 'взбивать 8–12 сек', 0),
      step('сборка и подача', 'перелить в стакан; запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance: 'Стакан с манговыми джус-болами и желе личи на дне, сверху — светло-жёлтая молочная эмульсия со льдом.',
      color: 'Светло-жёлтый / кремово-манговый.',
      taste: 'Тропический вкус манго с нотами личи и мягким молочным послевкусием.',
      consistency: 'Напиток — жидкий, со льдом; джус-болы и желе — упругие.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_MILK,
      nutrition: n(['2,8', '3,0', '44,0', '215 / 900'], ['3,6', '3,9', '57,0', '280 / 1172']),
    },
  }),

  subzero: () => ({
    // карта только 650 мл: 140.4+130+0.4+379.2 = 650 (лёд = 100×1.3)
    steps: [
      step('джус-болы «йогурт»', 'выложить на дно стакана', 140.4, 'jb_yogurt'),
      step('лёд пищевой', 'заполнить стакан', Math.round(ICE_G_PER_500 * 1.3 * 10) / 10, 'ice'),
      step('экстракт ментола', 'добавить 1–2 капли (~0,4 г), осторожно', 0.4, 'menthol'),
      step('газированная вода', 'заполнить до верха', 379.2, 'soda'),
      step('подача', 'запаять / закрыть; трубочка от 12 мм', 0),
    ],
    ttk: {
      appearance: 'Прозрачный стакан с йогуртными джус-болами, льдом и бесцветной/слегка мутноватой газированной основой.',
      color: 'Прозрачный с лёгкой молочной дымкой от джус-болов.',
      taste: 'Холодный освежающий вкус с ментоловой свежестью и лёгкой йогуртной нотой.',
      consistency: 'Напиток — жидкий, сильно охлаждённый, с газом; джус-болы — сочные.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_LEMONADE,
      nutrition: n(['0,2', '0,0', '28,0', '112 / 469'], ['0,3', '0,0', '36,0', '145 / 607']),
    },
  }),

  'klubnika-mango': () => ({
    // стакан 500 мл: 35+180+40+100+135 = 490 г (чуть меньше полного, без перелива)
    steps: [
      step('джус-болы «манго»', 'выложить на дно стакана', 35, 'jb_mango'),
      step('сироп «клубника»', 'влить на дно поверх джус-болов', 40, 'syrup_strawberry'),
      step(
        'пюре клубничное',
        'аккуратно выложить нижний ягодный слой (пюре: замороженная клубника + сахар + лёд, блендер)',
        180,
        'puree_strawberry'
      ),
      step('лёд пищевой', 'засыпать поверх ягодного слоя', ICE_G_PER_500, 'ice'),
      step('молоко питьевое 3,2%', 'заполнить оставшийся объём, не смешивая слои (не до края)', 135, 'milk'),
      step(
        'упаковка и подача',
        'запаять / закрыть купольной крышкой; трубочка от 12 мм; двухслойный контраст красный/белый',
        0
      ),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан со слоистой структурой. На дне — насыщенно-красный слой клубничного пюре с сиропом и жёлтыми джус-болами «Манго», сверху — белая молочная фаза со льдом.',
      color: 'Контрастный двуцветный (ярко-красный и белый) с жёлтыми акцентами топпинга.',
      taste: 'Сливочно-молочный вкус с выраженной ягодной сладостью клубники и тропическими нотами манго.',
      consistency:
        'Напиток — жидкая молочная фаза; пюре — густая ягодная текстура; джус-болы — сочные, лопающиеся.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_MILK,
      nutrition: n(['6,9', '7,1', '53,4', '305 / 1276'], ['8,9', '9,2', '69,5', '397 / 1661']),
    },
  }),

  'mango-marakuya': () => ({
    // 35+220+100+135 = 490
    steps: [
      step('джус-болы «маракуйя»', 'выложить на дно стакана', 35, 'jb_passion'),
      step(
        'пюре манго',
        'аккуратно выложить нижний слой (пюре: замороженное манго + сахар + лёд, блендер)',
        220,
        'puree_mango'
      ),
      step('лёд пищевой', 'засыпать поверх слоя пюре', ICE_G_PER_500, 'ice'),
      step('молоко питьевое 3,2%', 'заполнить оставшийся объём, не смешивая слои (не до края)', 135, 'milk'),
      step(
        'упаковка и подача',
        'запаять плёнкой; трубочка от 12 мм; двухслойный контраст жёлтый/белый',
        0
      ),
    ],
    ttk: {
      appearance:
        'Прозрачный стакан со слоистой структурой. На дне — жёлтое ледяное пюре манго и джус-болы «Маракуйя», сверху — белая молочная фаза со льдом.',
      color: 'Контрастный двуцветный (жёлтый и белый) с янтарными джус-болами.',
      taste: 'Сливочно-молочный вкус с манго и кисло-сладкой маракуйей.',
      consistency:
        'Напиток — жидкая молочная фаза; пюре — ледяная зернистая текстура; джус-болы — сочные, лопающиеся.',
      serveTemp: SERVE_COLD,
      storage: STORAGE_MILK,
      nutrition: n(['6,4', '6,8', '55,0', '310 / 1297'], ['8,3', '8,8', '71,5', '403 / 1686']),
    },
  }),

  glintvein: () => ({
    // 55+370+1+50+24 = 500
    steps: [
      step('тапиока вареная', 'положить на дно стакана', 55, 'tapioca'),
      step('сок виноградный', 'налить в питчер', 370, 'mat_muso8dhy_jys3r'),
      step('специи (глинтвейн)', 'добавить в сок', 1, 'mat_musoc0m4_aqlxm'),
      step('вода (фильтрованная)', 'довести объём при необходимости', 24, 'water'),
      step('прогрев', 'нагреть до 65–70 °C, не кипятить', 0),
      step('сборка', 'перелить в стакан поверх тапиоки', 0),
      step('сырная шапка', 'добавить сверху', 50, 'cheese_foam'),
      step('подача', 'закрыть термостойкой крышкой', 0),
    ],
    ttk: {
      appearance: 'Термостойкий стакан с тапиокой, горячим пряным виноградным напитком и сырной шапкой.',
      color: 'Глубокий рубиново-бордовый с кремовой шапкой.',
      taste: 'Тёплый пряный вкус глинтвейна с виноградной основой и сливочной шапкой.',
      consistency: 'Напиток — жидкий, горячий; тапиока — мягкая; шапка — воздушная.',
      serveTemp: SERVE_HOT,
      storage:
        'Вареная тапиока — до 4 часов при +18…+25 °C; сок после вскрытия — до 24 часов при +2…+6 °C; специи — в сухом месте.',
      nutrition: n(['1,2', '4,5', '52,0', '250 / 1046'], ['1,6', '5,9', '67,5', '325 / 1360']),
    },
  }),

};

function key_aliases(card: Pick<tech_card, 'id' | 'name' | 'menu_item_id' | 'cold' | 'hot'>): string[] {
  const name = (card.name || '').trim().toLowerCase().replace(/ё/g, 'е');
  const keys = [card.id, card.menu_item_id || '', name].filter(Boolean) as string[];
  if (/черн.*сахар|black/.test(name) && !/карамел/.test(name)) keys.push('original-black-led');
  if (/жасмин|jasmine/.test(name)) keys.push('jasmine-green-led');
  if (/троп.*фьюж|троп.*лимон|fusion/.test(name)) {
    keys.push('tropichesky-limonad');
  }
  if (/матча.*личи|личи.*матча|matcha-lichi/.test(name) || card.menu_item_id === 'matcha-lichi') {
    keys.push('matcha-lichi');
  } else if (/матча/.test(name)) {
    keys.push('matcha-latte-tiger');
  }
  if (
    card.menu_item_id !== 'taro-legacy' &&
    !/старый рецепт/.test(name) &&
    (card.menu_item_id === 'taro' || /^таро$|таро\b/.test(name))
  ) {
    keys.push('taro');
  }
  if (/какао|kakao/.test(name)) keys.push('kakao');
  if (/масала/.test(name)) keys.push('masala-chai');
  if (/тыкв|медов.*латте/.test(name) || card.menu_item_id === 'medovy-tykvenny-latte') {
    keys.push('medovy-tykvenny-latte');
  }
  if (/клубничн.*лимон/.test(name)) keys.push('klubnichny-limonad');
  if (/ананас.*маракуй|маракуй.*ананас/.test(name) || card.menu_item_id === 'ananas-marakuya') {
    keys.push('ananas-marakuya');
  }
  if (/нежн.*роз/.test(name)) keys.push('nezhnaya-roza');
  if (/малин.*йогурт/.test(name)) keys.push('malinovy-yogurt');
  if (/троп.*манго/.test(name)) keys.push('tropichesky-mango');
  if (/сабзиро|subzero/.test(name)) keys.push('subzero');
  if (/клубника.*манго|манго.*клубник/.test(name)) keys.push('klubnika-mango');
  if (/манго.*маракуй|маракуй.*манго/.test(name) || card.menu_item_id === 'mango-marakuya') {
    keys.push('mango-marakuya');
  }
  if (/глинтвейн/.test(name)) keys.push('glintvein');
  if (/ванил.*милк|милкти.*ванил|vanilny-milktea/.test(name) || card.menu_item_id === 'vanilny-milktea') {
    keys.push('vanilny-milktea');
  }
  if (
    /карамел.*черн|черн.*карамел|карамельный черный чай|cherny-karamel/.test(name) ||
    /cherny-karamel/.test(card.menu_item_id || '')
  ) {
    const mid = card.menu_item_id || '';
    if (mid === 'cherny-karamel' || mid === 'tc_cherny_karamel') keys.push('cherny-karamel');
    else if (mid.endsWith('-led') || mid.includes('karamel_led') || /со льдом|холод/.test(name)) {
      keys.push('cherny-karamel-led');
    } else if (card.hot === true && card.cold === false) {
      keys.push('cherny-karamel');
    } else {
      keys.push('cherny-karamel-led');
    }
  }
  return [...new Set(keys)];
}

export function ttk_preset_for(card: Pick<tech_card, 'id' | 'name' | 'menu_item_id'>): ttk_preset | null {
  for (const key of key_aliases(card)) {
    const factory = BY_KEY[key] || BY_KEY[key.replace(/^tc_/, '')];
    if (factory) return factory();
  }
  return null;
}

function scale_ing(ing: Record<string, number>, from_ml: number, to_ml: number) {
  const k = from_ml > 0 ? to_ml / from_ml : 1;
  return Object.fromEntries(
    Object.entries(ing).map(([id, q]) => [id, Math.round(q * k * 10) / 10])
  );
}

/** порции топпингов/рисунка — фиксированные граммы бариста, не ×1.3 */
const LOCKED_PORTION_IDS = new Set([
  'tapioca',
  'jelly_lychee',
  'jb_passion',
  'jb_yogurt',
  'jb_mango',
  'jb_strawberry',
  'topping_caramel',
  'matcha',
  'water',
  'juice_lemon',
]);

/** 650: жидкости масштабируем, порции топпингов оставляем как в 500 */
function scale_ing_lock_portions(ing: Record<string, number>, from_ml: number, to_ml: number) {
  const scaled = scale_ing(ing, from_ml, to_ml);
  const out: Record<string, number> = { ...scaled };
  for (const id of LOCKED_PORTION_IDS) {
    if (ing[id] != null) out[id] = ing[id];
  }
  return out;
}

/** синхронизировать sizes 500/650 из шагов (граммы = рецептура) */
export function sync_sizes_from_steps(
  card: tech_card,
  steps: prep_step[],
  materials: material[]
): Record<string, tech_card_size> {
  const { ingredients, packaging, saw_pack } = ingredients_from_steps(steps, materials);
  const prev_base = card.sizes['500'] || Object.values(card.sizes)[0];
  const prev650 = card.sizes['650'];
  const pack = saw_pack
    ? packaging
    : { ...(prev_base?.packaging || prev650?.packaging || {}) };
  // канон меню: только 500/650 (S/M/L сбрасываем при применении ТТК)
  return {
    '500': {
      volume: 500,
      ingredients,
      packaging: pack,
    },
    '650': {
      volume: 650,
      ingredients: scale_ing_lock_portions(ingredients, 500, 650),
      packaging: pack,
    },
  };
}

/** применить пресет: этапы, ttk и рецептуру 500/650 из шагов */
export function apply_ttk_preset(card: tech_card, materials: material[], force = false): tech_card {
  const preset = ttk_preset_for(card);
  if (!preset) return card;
  const need_steps = force || !card.steps?.length;
  const need_ttk = force || !card.ttk?.appearance?.trim();
  const need_serve = force || !card.ttk?.serveTemp?.trim();
  const need_sync =
    force ||
    need_steps ||
    !Object.values(card.sizes).some((s) => s.ingredients && Object.keys(s.ingredients).length > 0);

  if (!need_steps && !need_ttk && !need_serve && !need_sync) return card;

  const steps = need_steps ? preset.steps : card.steps || preset.steps;
  const sizes =
    need_steps || need_sync ? sync_sizes_from_steps(card, steps, materials) : card.sizes;

  return {
    ...card,
    steps,
    sizes,
    ...(need_ttk
      ? { ttk: preset.ttk }
      : need_serve && card.ttk
        ? { ttk: { ...card.ttk, serveTemp: preset.ttk.serveTemp } }
        : card.ttk
          ? { ttk: card.ttk }
          : {}),
  };
}

/** legacy id → канонические ice / water / rose_water */
export const AUX_MATERIAL_ALIASES: Record<string, string> = {
  mat_mv4yildy_6x8qf: 'ice',
  mat_mv4z43ac_6qsef: 'water',
  mat_mv4zawnr_sp3od: 'rose_water',
};

const AUX_DEFAULTS: material[] = [
  { id: 'ice', name: 'лёд пищевой', category: 'liquids', unit: 'kg', costPerUnit: 0 },
  { id: 'water', name: 'вода (фильтрованная)', category: 'liquids', unit: 'L', costPerUnit: 0 },
  { id: 'rose_water', name: 'розовая вода', category: 'liquids', unit: 'L', costPerUnit: 900, minStock: 200 },
];

function remap_id(id: string) {
  return AUX_MATERIAL_ALIASES[id] || id;
}

function remap_qty_map(map: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [id, q] of Object.entries(map)) {
    const to = remap_id(id);
    out[to] = (out[to] || 0) + q;
  }
  return out;
}

/**
 * старые id mat_* сливаем в канонические.
 * вода, лёд и розовая вода остаются в каталоге.
 * вода и лёд бесплатные: в ингредиентах видны, деньги не считают.
 * розовая вода — обычный остаток, её же считают на инвентаризации.
 */
export function ensure_aux_stock_materials(state: finance_state): finance_state {
  const removed = new Set(state.removedMaterialIds ?? []);
  const materials_in: material[] = [];
  const seen = new Set<string>();
  for (const row of state.materials) {
    const id = AUX_MATERIAL_ALIASES[row.id] || row.id;
    if (removed.has(id) || seen.has(id)) continue;
    seen.add(id);
    materials_in.push(id === row.id ? row : { ...row, id });
  }
  let materials = materials_in;
  const have = new Set(materials.map((m) => m.id));
  for (const d of AUX_DEFAULTS) {
    if (removed.has(d.id) || have.has(d.id)) continue;
    materials = [...materials, { ...d }];
    have.add(d.id);
  }
  materials = materials.map((m) => {
    if (m.id !== 'water' && m.id !== 'ice') return m;
    const next = { ...m, costPerUnit: 0 };
    delete next.minStock;
    return next;
  });

  const techCards: tech_card[] = state.techCards.map((card) => ({
    ...card,
    steps: card.steps?.map((s) =>
      s.materialId ? { ...s, materialId: remap_id(s.materialId) } : s
    ),
    sizes: Object.fromEntries(
      Object.entries(card.sizes).map(([k, size]) => [
        k,
        {
          ...size,
          ingredients: remap_qty_map(size.ingredients || {}),
          packaging: remap_qty_map(size.packaging || {}),
        },
      ])
    ),
  }));

  const stockMovements = state.stockMovements.map((mv) => ({
    ...mv,
    materialId: remap_id(mv.materialId),
  }));

  return { ...state, materials, techCards, stockMovements };
}

/**
 * пресет подставляем только в пустые карты.
 * иначе любое сохранение затирало ручные граммовки (лёд/сумма/«канон»).
 */
function recipe_needs_refresh(card: tech_card): boolean {
  if (is_archived_taro(card)) return false;
  if (!ttk_preset_for(card)) return false;
  if (!card.steps?.length) return true;
  if (!card.ttk?.appearance?.trim()) return true;
  const size = card.sizes['500'] || Object.values(card.sizes)[0];
  if (!size?.ingredients) return true;
  return !Object.keys(size.ingredients).some((id) => Number(size.ingredients[id]) > 0);
}

function is_archived_taro(card: Pick<tech_card, 'id' | 'name' | 'menu_item_id'>) {
  const name = (card.name || '').toLowerCase();
  return card.id === 'tc_taro_legacy' || card.menu_item_id === 'taro-legacy' || /старый рецепт/.test(name);
}

function has_pitcher_recipe(card: tech_card) {
  return (card.steps ?? []).some((s) => /мощность 600/.test(s.hint || '') || s.qty_label === '9 капель');
}

/** таро и тыквенный латте: один раз заменить карту, где ещё нет нового процесса */
function recipe_stamp_missing(card: tech_card) {
  if (is_archived_taro(card)) return false;
  const keys = key_aliases(card);
  const live = keys.some((k) => k === 'taro' || k === 'medovy-tykvenny-latte');
  if (!live) return false;
  return !has_pitcher_recipe(card);
}

function card_has_any_recipe(card: tech_card) {
  if ((card.steps ?? []).some((s) => s.qty > 0 || s.materialId)) return true;
  return Object.values(card.sizes).some((size) =>
    Object.values(size.ingredients || {}).some((q) => Number(q) > 0)
  );
}

function clone_legacy_taro(live: tech_card): tech_card {
  return {
    id: 'tc_taro_legacy',
    name: 'таро (старый рецепт)',
    menu_item_id: 'taro-legacy',
    cold: live.cold !== false,
    hot: live.hot === true,
    steps: (live.steps ?? []).map((s) => ({ ...s, id: `legacy_${s.id}` })),
    sizes: Object.fromEntries(
      Object.entries(live.sizes).map(([k, size]) => [
        k,
        {
          volume: size.volume,
          ingredients: { ...size.ingredients },
          packaging: { ...size.packaging },
          ...(size.manual ? { manual: true } : {}),
        },
      ])
    ),
    ...(live.ttk ? { ttk: { ...live.ttk, nutrition: { ...live.ttk.nutrition } } } : {}),
  };
}

/** пресет таро до смены граммовок — если в базе ещё нет сохранённых шагов */
function baked_old_taro(materials: material[]): tech_card {
  const steps: prep_step[] = [
    { id: 'step_taro_legacy_tapioca', title: 'тапиока вареная', hint: 'выложить на дно стакана', qty: 50, materialId: 'tapioca' },
    { id: 'step_taro_legacy_mix', title: 'смесь «таро»', hint: 'развести с молоком до однородности', qty: 56, materialId: 'taro_mix' },
    { id: 'step_taro_legacy_milk', title: 'молоко', hint: 'добавить к смеси таро', qty: 294, materialId: 'milk' },
    { id: 'step_taro_legacy_ice', title: 'лёд пищевой', hint: 'засыпать в шейкер (холодный)', qty: ICE_G_PER_500, materialId: 'ice' },
    { id: 'step_taro_legacy_mixstep', title: 'смешивание', hint: 'холодный — взбить со льдом; горячий — прогреть до 65–70 °C', qty: 0 },
    { id: 'step_taro_legacy_serve', title: 'подача', hint: 'перелить в стакан', qty: 0 },
  ];
  const card: tech_card = {
    id: 'tc_taro_legacy',
    name: 'таро (старый рецепт)',
    menu_item_id: 'taro-legacy',
    cold: true,
    hot: true,
    sizes: { '500': { volume: 500, ingredients: {}, packaging: {} } },
    ttk: {
      appearance: 'Стакан с тапиокой на дне и плотным лиловым слоем таро, без сырной шапки.',
      color: 'Характерный сиренево-лиловый цвет таро.',
      taste: 'Сладковатый орехово-ванильный вкус таро с молочными нотами.',
      consistency: 'Напиток — густой, обволакивающий; тапиока — упругая.',
      serveTemp: SERVE_DUAL,
      storage: STORAGE_MILK,
      nutrition: n(['3,8', '7,2', '52,0', '290 / 1213'], ['4,9', '9,4', '67,5', '377 / 1577']),
    },
  };
  return { ...card, steps, sizes: sync_sizes_from_steps(card, steps, materials) };
}

function with_taro_archive(cards: tech_card[], materials: material[]): tech_card[] {
  if (cards.some(is_archived_taro)) return cards;
  const live = cards.find((c) => c.menu_item_id === 'taro' || c.id === 'tc_taro');
  const snapshot =
    live && !has_pitcher_recipe(live) && card_has_any_recipe(live)
      ? clone_legacy_taro(live)
      : baked_old_taro(materials);
  return [...cards, snapshot];
}

export function hydrate_ttk_finance(state: finance_state, force = false): finance_state {
  const with_aux = ensure_aux_stock_materials(state);
  const archived = with_taro_archive(with_aux.techCards, with_aux.materials);
  let changed = archived !== with_aux.techCards;
  const techCards = archived.map((card) => {
    const do_force = force || recipe_needs_refresh(card) || recipe_stamp_missing(card);
    let next = apply_ttk_preset(card, with_aux.materials, do_force);
    if (do_force && key_aliases(card).includes('medovy-tykvenny-latte')) {
      next = { ...next, cold: false, hot: true };
    }
    if (do_force && key_aliases(card).includes('taro') && !is_archived_taro(card)) {
      next = { ...next, cold: true, hot: true };
    }
    const filled = backfill_step_ingredients(next);
    if (filled !== next) next = filled;
    if (next !== card) changed = true;
    return next;
  });
  return changed ? { ...with_aux, techCards } : with_aux;
}
