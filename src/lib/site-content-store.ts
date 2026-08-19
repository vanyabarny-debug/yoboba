export type product_addon = {
  id: string;
  name: string;
  price: number;
  emoji: string;
  tint: string;
};

export const site_content_version = 18;

export type category_nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
};

const storage_key = 'yoboba_site_content';
const update_event = 'yoboba-site-content-update';

export type top_bar_link = {
  id: string;
  label: string;
  href: string;
  is_active: boolean;
};

export type site_page = {
  slug: string;
  title: string;
  body: string;
};

export const default_addons: product_addon[] = [
  { id: 'tapioca', name: 'доп. тапиока', price: 40, emoji: '⚫', tint: 'from-neutral-100 to-neutral-200' },
  { id: 'cheese', name: 'сырная пенка', price: 80, emoji: '🧀', tint: 'from-amber-50 to-amber-100' },
  { id: 'juice', name: 'джусболы', price: 60, emoji: '🫧', tint: 'from-sky-50 to-sky-100' },
  { id: 'aloe', name: 'алоэ', price: 50, emoji: '🌿', tint: 'from-emerald-50 to-emerald-100' },
  { id: 'sago', name: 'саго', price: 45, emoji: '⚪', tint: 'from-zinc-50 to-zinc-100' },
  { id: 'pudding', name: 'пудинг', price: 55, emoji: '🍮', tint: 'from-orange-50 to-orange-100' },
  { id: 'cream', name: 'взбитые сливки', price: 65, emoji: '☁️', tint: 'from-violet-50 to-violet-100' },
  { id: 'matcha', name: 'доп. матча', price: 70, emoji: '🍵', tint: 'from-lime-50 to-lime-100' },
];

export type site_content_store = {
  version: number;
  top_bar_links: top_bar_link[];
  lang_link: { label: string; href: string };
  pages: site_page[];
  addons: product_addon[];
  topping_portion_price: number;
  category_compositions: Record<string, string>;
  category_descriptions: Record<string, string>;
  category_nutrition: Record<string, category_nutrition>;
};

const default_category_nutrition: Record<string, category_nutrition> = {
  'классические бабл ти': { kcal: 64, protein: 1.4, fat: 1.6, carb: 11.5 },
  'с джусболами': { kcal: 58, protein: 0.6, fat: 0.4, carb: 13.5 },
  матча: { kcal: 60, protein: 1.8, fat: 1.9, carb: 9.5 },
  пп: { kcal: 31, protein: 2.2, fat: 0.4, carb: 4.8 },
  фраппе: { kcal: 82, protein: 2.0, fat: 3.4, carb: 11.2 },
  'газированные бабл ти': { kcal: 44, protein: 0.2, fat: 0.1, carb: 10.8 },
  'бабл тоники': { kcal: 38, protein: 0.2, fat: 0.1, carb: 9.2 },
  закуски: { kcal: 240, protein: 6.5, fat: 11, carb: 28 },
  десерты: { kcal: 290, protein: 4.5, fat: 14, carb: 36 },
  комбо: { kcal: 95, protein: 2.5, fat: 3.5, carb: 13 },
};

const fallback_nutrition: category_nutrition = { kcal: 55, protein: 1.2, fat: 1.3, carb: 10 };

const default_compositions: Record<string, string> = {
  'классические бабл ти': 'чай, молоко, тапиока, сироп, лёд',
  'с джусболами': 'чай или основа, фруктовые джусболы, тапиока, сироп, лёд',
  матча: 'матча, молоко, тапиока, лёд',
  пп: 'основа без сахара, протеин или фрукты, лайт-сироп, лёд',
  фраппе: 'основа, молоко, лёд, взбитая текстура, топпинг',
  'газированные бабл ти': 'газированная основа, тапиока, сироп, лёд',
  'бабл тоники': 'тоник, фруктовая нота, тапиока, лёд',
  закуски: 'мука / рис, начинка, специи',
  десерты: 'основа, крем, топпинг',
  комбо: 'напиток, закуска или десерт',
};

const default_descriptions: Record<string, string> = {
  'классические бабл ти':
    'классический молочный бабл ти с жевательной тапиокой — готовим после заказа, можно настроить объём, лёд и сладость.',
  'с джусболами':
    'напиток с фруктовыми джусболами — при питье шарики лопаются и дают яркий вкус.',
  матча: 'матча-основа с мягким umami-вкусом, подаём со льдом и тапиокой.',
  пп: 'лайт-версия без лишней сладости — подходит для лёгкого перекуса.',
  фраппе: 'взбитый холодный напиток с насыщенной текстурой и топпингом.',
  'газированные бабл ти': 'игривая газированная база с тапиокой и льдом.',
  'бабл тоники': 'освежающий тоник с фруктовой нотой и шариками тапиоки.',
  закуски: 'закуска к напитку — удобно взять вместе с бабл ти.',
  десерты: 'десерт к напитку — сладкое дополнение к заказу.',
  комбо: 'готовый сет: напиток и дополнение в одной позиции.',
};

export const default_top_bar_links: top_bar_link[] = [
  { id: 'about', label: 'о нас', href: '/o-nas', is_active: true },
  { id: 'jobs', label: 'работа в yomoyo', href: '/rabota', is_active: true },
  { id: 'contacts', label: 'контакты', href: '/kontakty', is_active: true },
  { id: 'promos', label: 'акции', href: '/akcii', is_active: true },
  { id: 'tapioca', label: 'шарики тапиоки', href: '/shariki-tapioki', is_active: true },
];

export const default_pages: site_page[] = [
  {
    slug: 'o-nas',
    title: 'о нас',
    body: `yomoyo — это больше, чем бабл-ти. это место с огромным выбором креативных напитков, хрустящими корндогами и тем самым торнадо-потэйто. наше меню меняется быстрее, чем тренды.

мы постоянно дропаем лимитированные вкусы и коллаборации, которые нужно успеть поймать здесь и сейчас. повторов не будет.

в yomoyo полная свобода: заходи с собакой, заряжай телефон, мы не прячем пароль от wi-fi. а для школьников и студентов у нас всегда есть скидки.

мы топим за взаимное уважение. всегда стоим горой за своих сотрудников и защищаем команду от любого негатива и хамства. если ты вежливый, открытый и активный гость, то ты автоматически также становишься частью нашей большой команды. здесь все делают общий крутой продукт: наши бариста вкладывают душу в каждый стакан, искренне заботятся и создают сервис, а ты — помогаешь нам становиться лучше, делишься советами, ставишь честные оценки и доверяешь нашему вкусу.

заходи, у нас нишево.

ps — а еще мы любим жестко пошутить и приколоться. мы уверены: над болезненными и сложными темами шутить не просто можно, а нужно. юмор превращает любого страшного врага в нелепого соперника, с которым проще бороться. так что не удивляйся потом и не кэнсели нас за преколы, ты знаешь чего от нас ожидать.

## что мы готовим и как

почему мы так хотим познакомиться? потому что дальше наш продукт всё делает сам. люди видят, что это вкусно, и возвращаются снова. нам главное первый раз это показать.

стритфуд и креативные напитки — это конструктор. если детали качественные, то и результат будет в порядке. вот наши детали:

1. тапиока
основа всего. её делают из натурального крахмала корня маниоки. в сыром виде это хрупкие шарики, но мы варим их каждый день с нуля. четкий тайминг варки, томление под крышкой и купание в карамельном сиропе дают ту самую идеальную упругость, которую в азии называют «кью-кью».

2. авторские базы
мы не используем готовые порошки. наши напитки — это микс из ледяного чая (улун, жасмин, матча), натурального молока, крема и сочных фруктовых пюре.

3. корндоги и торнадо-потэйто
наш сытный стритфуд. идеальная хрустящая корочка, тянущийся сыр и максимальное удобство, чтобы перекусить на бегу.

4. осознанная упаковка
мы используем только то, что реально нужно человеку, и осознанно избегаем лишнего пластика и слоев бумаги. это наш способ заботиться о природе и не надувать цену за счет ненужного картона. ты платишь за крутой вкус, а не за лишнюю обертку.

## почему yomoyo?

yomoyo — это философия движения и эстетика вкуса в каждом глотке. мы превратили процесс приготовления бабл-ти в настоящий ритуал, где каждый ингредиент имеет свое место и значение.

разберём имя так, как разбирают слово в лингвистике: по морфемам, звуку и смыслу.

1. yo
meta: морфема · звук
reading: yo · ё
sense: энергия · ритм · движение
это энергия и ритм. это тот самый звук шейкера и динамика, с которой мы создаем ваш идеальный микс.

2. moyo
meta: морфема · смысл
reading: moyō · моё
sense: узор · рисунок · слои
kanji: 模様
это искусство узора. в японском moyo (模様) означает «узор» или «рисунок». для нас это эстетика слоев: как тапиока, молоко и чай переплетаются в стакане, создавая уникальный визуальный рисунок.

## ценности компании

1. безупречный вид и редкие релизы
наши напитки созданы для того, чтобы собирать взгляды. мы постоянно меняем правила игры: дропаем лимитированные вкусы и делаем громкие коллаборации, которые нужно успеть поймать, пока они не закончились. мы превращаем обычную покупку в событие и даем повод кайфануть от классного, редкого продукта. это доступно каждому, но повтора не будет.

2. слышать, а не просто слушать
радость гостя от покупки складывается из мелочей. мы не работаем по скучным скриптам — мы общаемся. через правильные вопросы мы узнаем, чего именно хочет человек здесь и сейчас. мы собираем отзывы, оценки и постоянно докручиваем сервис, чтобы гостю было максимально удобно. вежливость, эмпатия и искреннее желание разобраться — наша база.

3. свобода в зале
в наших стенах — полная свобода для гостей. с собакой? заходи. нужно зарядить ноут или просто зайти в туалет? без проблем. мы не строим из себя пафосное место, где нужно соответствовать рамкам. у нас можно быть собой и делать все, что не нарушает закон и не мешает окружающим.

4. уважение взаимно (команда на первом месте)
гость безусловно важен, но наши сотрудники — это сердце компании. принцип «клиент всегда прав» у нас не работает, если переходят границы. мы ценим достоинство своей команды: если гость хамит или ведет себя токсично, бариста имеет полное право отказать в обслуживании. мы всегда защитим своих людей.

5. работа, которой гордятся, и безграничный рост
мы платим зп значительно выше рынка, потому что ценим качественный и ответственный труд. наши люди не должны чувствовать себя ущемленными или обманутыми. при этом мы даем прозрачный и гарантированный социальный лифт: от бариста за стойкой до шеф-бариста, управляющего или члена совета директоров с возможностью открывать новые города. твой рост зависит только от твоего времени и амбиций.

6. осознанная упаковка и баланс
мы используем только то, что реально нужно человеку, и осознанно избегаем лишнего пластика и бумаги. это наш способ заботиться о природе и не надувать цену за счет ненужного картона. гость должен платить за крутой вкус и качество, а не за лишнюю обертку, которая через минуту окажется в урне.

## цели компании

1. построить крупнейшую международную сеть
наша цель — раскачать бренд до масштабов планеты и стать главной мировой сетью в нише креативных напитков и стритфуда. мы докажем, что локальный проект может задавать тренды всему миру.

2. перевернуть стандарты сервиса и заботы о людях
мы хотим показать всему миру, как на самом деле нужно относиться к команде и как должен выглядеть кастомный сервис. мы докажем, что бизнес процветает, когда сотрудники получают зарплату сильно выше рынка, чувствуют себя защищенными и имеют реальный социальный лифт, а не рабские скрипты. мы создаем лучшие рабочие места, где люди гордятся тем, что они делают.

3. создать независимую экосистему и производство
мы не планируем зависеть от сторонних подрядчиков. в наших целях — запустить собственное производство качественного сырья, экологичной упаковки и технологичного софта. мы будем создавать свой продукт «от и до», делать это максимально рационально и независимо.`,
  },
  {
    slug: 'rabota',
    title: 'работа в yomoyo',
    body: 'ищем бариста и сменных сотрудников в наши точки.\n\nесли любишь bubble tea, умеешь работать в ритме и хочешь расти вместе с брендом — напиши нам в контактах или приходи в ближайшую точку.',
  },
  {
    slug: 'kontakty',
    title: 'контакты',
    body: 'телефон: +7 (900) 000-00-00\n\nпочта: hello@yomoyo.ru\n\nвремя работы: ежедневно с 10:00 до 22:00\n\nадрес: уточняйте в приложении при выборе города.',
  },
  {
    slug: 'akcii',
    title: 'акции',
    body: 'здесь собраны текущие акции yomoyo — комбо, скидки на категории и сезонные предложения.',
  },
  {
    slug: 'akciya-pervye-100',
    title: 'бесплатно нальём самым быстрым',
    body: `сто первых гостей получают напиток бесплатно. чтобы участвовать — зайди в пост вк и сделай три шага.

## три шага

1. подпишись
на наше сообщество вконтакте

2. поставь лайк
записи с акцией

3. сделай репост
себе на стену и в историю

## правила

1. 1 репост = 1 напиток = 1 рука
один репост — один напиток

2. напиток выбрать нельзя
на кассе скажут, какой именно идёт в подарок

3. всего 100 бесплатных напитков
кто успел к открытию — тот и забрал

участие только через запись: https://vk.ru/wall-240740999_1`,
  },
  {
    slug: 'akciya-studentam',
    title: 'студентам и школьникам −30%',
    body: `учишься — пей выгоднее. в yomoyo школьникам и студентам скидка 30% на напитки при предъявлении дневника или студенческого билета.

без сложных условий: пришёл, показал документ, получил скидку.

## кому положено

1. школьникам
действующий дневник или школьный документ, который подтверждает статус ученика.

2. студентам
студенческий билет очного или заочного отделения — достаточно показать на кассе / бариста.

## как получить

1. выбери напиток
любой напиток из меню yomoyo (кроме отдельных спецпредложений, если они помечены отдельно).

2. покажи документ
дневник или студенческий билет — при заказе у бариста.

3. получи −30%
скидка применяется к напитку в момент оплаты. один документ — на твой заказ.

## правила

скидка действует постоянно в точках yomoyo. документ должен принадлежать гостю, который оформляет заказ. акция не суммируется с другими скидками и комбо, если не сказано иное. по вопросам — hello@yomoyo.ru или у бариста.`,
  },
  {
    slug: 'akciya-podari-napitok',
    title: 'подари ей напиток',
    body: `хочешь сделать приятное — подари напиток yomoyo. выбери любой коктейль, укажи номер телефона и оплати онлайн: человеку придёт подарок, и он заберёт его в точке.

тепло без лишних слов: ты выбираешь напиток, он получает сюрприз.

## как это работает

1. выбери напиток
собери заказ как обычно, открой корзину и отметь «это подарок».

2. укажи номер
введи телефон человека, которому даришь. напиток именной: забрать сможет только он.

3. оплати онлайн
сейчас тестовая оплата, позже подключим кассу. после оплаты подарок сразу уйдёт на указанный номер.

## что важно знать

1. подарок именной
напиток ждёт именно того, чей номер ты указал. передать «на кого угодно» нельзя.

2. срок
забрать нужно в течение 14 дней — в приложении или на кассе по этому номеру.

3. если номер ошибочный
проверь номер перед оплатой: подарок уйдёт туда, куда ты указал.

## правила

сервис подарков доступен при заказе через yomoyo. организатор — yomoyo. подарок нельзя обменять на деньги. если одаряемый не забрал напиток в срок, заказ может быть аннулирован. вопросы: hello@yomoyo.ru.`,
  },
  {
    slug: 'napitok-mesyaca-subzero',
    title: 'напиток месяца — subzero',
    body: `сейчас в роли напитка месяца — subzero: холодная газировка на блюкюрасао с джусболами личи-ментолом и желе кокосовым.

лёд, цвет, хруст шариков и мягкий кокос — один глоток, и лето внутри стакана.

## что внутри

1. основа
холодная газировка на блюкюрасао — яркий синий цвет и лёгкая свежесть.

2. джусболы
личи с ментолом: сочные шарики, которые лопаются во рту прохладной волной.

3. желе
кокосовое желе — мягкая текстура и сливочно-тропический акцент.

## как попробовать

1. найди в меню
открой категорию «газированные бабл ти» — там subzero с плашкой «месяца».

2. собери под себя
уровень сладости и лёд можно настроить у бариста, если хочешь ещё холоднее.

3. успей в месяце
напиток месяца меняется: subzero — герой сейчас, потом на смену придёт новый вкус.

## коротко о вкусе

subzero — это холодная газировка, блюкюрасао, джусболы личи-ментол и кокосовое желе. если любишь яркий цвет и ледяную свежесть — начинай с него.`,
  },
  {
    slug: 'shariki-tapioki',
    title: 'шарики тапиоки',
    body: 'тапиока — главная фишка bubble tea: мягкие жевательные шарики из крахмала.\n\nмы варим их каждый день, чтобы они оставались упругими и нежными. можно добавить дополнительную порцию в любой напиток.',
  },
  {
    slug: 'yazyk',
    title: 'язык',
    body: 'сейчас сайт доступен на русском.\n\nанглийская версия в разработке — скоро можно будет переключить язык в один клик.',
  },
];

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

function is_code_owned_page(slug: string) {
  return (
    slug === 'o-nas' ||
    slug === 'akcii' ||
    slug.startsWith('akciya-') ||
    slug === 'napitok-mesyaca-subzero'
  );
}

export function get_default_site_content(): site_content_store {
  return {
    version: site_content_version,
    top_bar_links: default_top_bar_links.map((l) => ({ ...l })),
    lang_link: { label: 'язык', href: '/yazyk' },
    pages: default_pages.map((p) => ({ ...p })),
    addons: default_addons.map((a) => ({ ...a })),
    topping_portion_price: 60,
    category_compositions: { ...default_compositions },
    category_descriptions: { ...default_descriptions },
    category_nutrition: { ...default_category_nutrition },
  };
}

export function get_site_content_store(): site_content_store {
  if (typeof window === 'undefined') return get_default_site_content();
  const raw = localStorage.getItem(storage_key);
  const seed = get_default_site_content();
  if (!raw) {
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as site_content_store;
    const needs_upgrade = !parsed.version || parsed.version < site_content_version;
    const seed_pages = seed.pages.map((seed_page) => {
      const existing = (parsed.pages ?? []).find((p) => p.slug === seed_page.slug);
      if (!existing || is_code_owned_page(seed_page.slug)) return seed_page;
      if (!needs_upgrade) return existing;
      const mentions_old =
        /баблтишн/i.test(existing.title) || /баблтишн/i.test(existing.body);
      if (!mentions_old) return existing;
      return {
        ...existing,
        title: /баблтишн/i.test(existing.title) ? seed_page.title : existing.title,
        body: /баблтишн/i.test(existing.body) ? seed_page.body : existing.body,
      };
    });
    const extra_pages = (parsed.pages ?? []).filter(
      (page) => !seed.pages.some((seed_page) => seed_page.slug === page.slug)
    );
    const top_bar_links = seed.top_bar_links.map((seed_link) => {
      const existing = (parsed.top_bar_links ?? []).find((l) => l.id === seed_link.id);
      if (!existing) return seed_link;
      if (/баблтишн/i.test(existing.label)) {
        return { ...existing, label: seed_link.label };
      }
      return existing;
    });
    const merged = {
      ...seed,
      ...parsed,
      version: site_content_version,
      pages: [...seed_pages, ...extra_pages],
      top_bar_links,
      topping_portion_price: parsed.topping_portion_price ?? 60,
      category_nutrition: {
        ...default_category_nutrition,
        ...parsed.category_nutrition,
      },
    };
    if (
      needs_upgrade ||
      JSON.stringify(parsed.pages) !== JSON.stringify(merged.pages)
    ) {
      localStorage.setItem(storage_key, JSON.stringify(merged));
    }
    return merged;
  } catch {
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function save_site_content_store(store: site_content_store) {
  localStorage.setItem(
    storage_key,
    JSON.stringify({ ...store, version: site_content_version })
  );
  emit_update();
}

export function reset_site_content_store() {
  save_site_content_store(get_default_site_content());
}

export function subscribe_site_content_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function get_page_by_slug(slug: string): site_page | undefined {
  if (is_code_owned_page(slug)) {
    return get_default_page_by_slug(slug);
  }
  return get_site_content_store().pages.find((p) => p.slug === slug);
}

/** только дефолты из кода — безопасно для SSR / первого рендера без localStorage */
export function get_default_page_by_slug(slug: string): site_page | undefined {
  return get_default_site_content().pages.find((p) => p.slug === slug);
}

export function upsert_page(page: site_page) {
  const store = get_site_content_store();
  const idx = store.pages.findIndex((p) => p.slug === page.slug);
  if (idx >= 0) store.pages[idx] = page;
  else store.pages.push(page);
  save_site_content_store(store);
}

export function upsert_top_bar_link(link: top_bar_link) {
  const store = get_site_content_store();
  const idx = store.top_bar_links.findIndex((l) => l.id === link.id);
  if (idx >= 0) store.top_bar_links[idx] = link;
  else store.top_bar_links.push(link);
  save_site_content_store(store);
}

export function delete_top_bar_link(id: string) {
  const store = get_site_content_store();
  store.top_bar_links = store.top_bar_links.filter((l) => l.id !== id);
  save_site_content_store(store);
}

export function move_top_bar_link(id: string, dir: -1 | 1) {
  const store = get_site_content_store();
  const idx = store.top_bar_links.findIndex((l) => l.id === id);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= store.top_bar_links.length) return;
  const list = [...store.top_bar_links];
  [list[idx], list[next]] = [list[next], list[idx]];
  store.top_bar_links = list;
  save_site_content_store(store);
}

export function new_top_bar_link_id() {
  return `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function upsert_addon(addon: product_addon) {
  const store = get_site_content_store();
  const idx = store.addons.findIndex((a) => a.id === addon.id);
  if (idx >= 0) store.addons[idx] = addon;
  else store.addons.push(addon);
  save_site_content_store(store);
}

export function delete_addon(id: string) {
  const store = get_site_content_store();
  store.addons = store.addons.filter((a) => a.id !== id);
  save_site_content_store(store);
}

export function new_addon_id() {
  return `addon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function set_lang_link(link: { label: string; href: string }) {
  const store = get_site_content_store();
  store.lang_link = link;
  save_site_content_store(store);
}

export function set_category_composition(category: string, value: string) {
  const store = get_site_content_store();
  store.category_compositions[category] = value;
  save_site_content_store(store);
}

export function set_category_description(category: string, value: string) {
  const store = get_site_content_store();
  store.category_descriptions[category] = value;
  save_site_content_store(store);
}

export function get_topping_portion_price(): number {
  if (typeof window === 'undefined') return 60;
  const price = get_site_content_store().topping_portion_price;
  return Number.isFinite(price) && price > 0 ? price : 60;
}

export function set_topping_portion_price(price: number) {
  const store = get_site_content_store();
  store.topping_portion_price = Math.max(0, Math.round(price));
  save_site_content_store(store);
}

export function get_category_nutrition(category: string): category_nutrition {
  const store = get_site_content_store();
  return store.category_nutrition?.[category] ?? default_category_nutrition[category] ?? fallback_nutrition;
}

export function set_category_nutrition(category: string, nutrition: category_nutrition) {
  const store = get_site_content_store();
  store.category_nutrition = {
    ...store.category_nutrition,
    [category]: {
      kcal: Math.max(0, Math.round(nutrition.kcal)),
      protein: Math.max(0, Number(nutrition.protein) || 0),
      fat: Math.max(0, Number(nutrition.fat) || 0),
      carb: Math.max(0, Number(nutrition.carb) || 0),
    },
  };
  save_site_content_store(store);
}

export function parse_composition(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
