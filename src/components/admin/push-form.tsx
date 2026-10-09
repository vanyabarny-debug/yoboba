import Link from 'next/link';

export default function push_form() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h3 className="mb-2 font-semibold">пуш-рассылка</h3>
      <p className="mb-3 text-sm text-neutral-500">
        разные тексты и выбор, кому отправить — в разделе «клиенты»
      </p>
      <Link
        href="/admin/customers"
        className="inline-flex rounded-pill bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
      >
        открыть клиентов
      </Link>
    </div>
  );
}
