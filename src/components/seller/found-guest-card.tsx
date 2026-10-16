'use client';

import { GuestLevelMark, type level_mark } from '@/components/guest-level-mark';
import TapicoinIcon from '@/components/tapicoin-icon';
import { format_phone_display } from '@/lib/phone';

/** карточка найденного гостя — та же строка, что в списке клиентов */
export default function found_guest_card({
  customer,
  pickup_code,
}: {
  customer: {
    name: string | null;
    phone: string | null;
    bonus_balance: number;
    student_verified?: boolean;
    level?: level_mark | null;
  };
  pickup_code?: string | null;
}) {
  const level = customer.level;
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="text-[15px]"
          style={{
            color: level ? level.color : '#171717',
            fontWeight: level?.weight || 600,
          }}
          title={level?.who}
        >
          {customer.name || 'гость'}
        </span>
        {level ? <GuestLevelMark level={level} /> : null}
        <span className="inline-flex items-center gap-1 rounded-full bg-[#0039A6] py-0.5 pl-0.5 pr-1.5 text-white">
          <TapicoinIcon size={16} className="!ring-white/30" />
          <span className="text-[11px] font-bold tabular-nums leading-none">{customer.bonus_balance}</span>
        </span>
        {customer.student_verified ? (
          <span className="inline-flex items-center rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            студент
          </span>
        ) : null}
      </div>
      {customer.phone ? (
        <p className="mt-0.5 text-sm font-medium tabular-nums text-neutral-700">
          {format_phone_display(customer.phone)}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-neutral-400">телефон не указан в профиле</p>
      )}
      {pickup_code ? (
        <p className="mt-1 text-xs font-semibold text-accent">найден по коду {pickup_code}</p>
      ) : null}
    </div>
  );
}
