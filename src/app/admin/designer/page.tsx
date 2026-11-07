import AdminShell from '@/components/admin/admin-shell';

export default function designer_page() {
  return (
    <AdminShell>
      <div className="max-w-xl">
        <h1 className="font-heading-soft text-3xl text-neutral-900">редактор</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          промо, комбо с блином и напитком, буклет, постеры, флаеры, карточки меню и баннер в четырёх
          размерах собраны в один холст. левая кнопка двигает и меняет размер, правая открывает
          настройки. на телефоне то же самое долгим нажатием.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href="/admin/studio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex bg-accent px-5 py-3 text-sm text-white"
          >
            открыть редактор
          </a>
          <a
            href="/admin/studio?format=menu"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex bg-neutral-900 px-5 py-3 text-sm text-white"
          >
            меню
          </a>
        </div>
        <p className="mt-3 text-xs text-neutral-400">откроется отдельной вкладкой, внутри есть режим на весь экран</p>
        <p className="mt-10 text-xs text-neutral-400">
          <a href="/admin/designer/index.html" className="underline">
            бренд, шрифты, меню A1 и наклейки
          </a>
        </p>
      </div>
    </AdminShell>
  );
}
