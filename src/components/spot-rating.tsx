'use client';

import type { store_spot } from '@/lib/types';
import {
  spot_has_yandex,
  spot_yandex_org_id,
  yandex_review_url,
  yandex_widget_src,
} from '@/lib/yandex-spot';

type props = {
  spot: store_spot | null | undefined;
};

export default function spot_rating({ spot }: props) {
  const org_id = spot_yandex_org_id(spot);
  const review = yandex_review_url(spot);

  if (!spot_has_yandex(spot)) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {org_id ? (
        <iframe
          src={yandex_widget_src(org_id)}
          width={150}
          height={50}
          title="рейтинг в Яндексе"
          frameBorder={0}
          className="block h-[50px] w-[150px] max-w-full border-0"
        />
      ) : null}
      {review ? (
        <a
          href={review}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center rounded-full border border-accent px-3 text-[13px] font-semibold leading-none text-accent transition-colors hover:bg-accent/10"
        >
          оценить
        </a>
      ) : null}
    </div>
  );
}
