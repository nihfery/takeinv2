import { Building2, Star, StarIcon } from 'lucide-react';
import { dataOf } from '../../../api';
import { Metric, SimpleTable } from '../../components/common/DataDisplay';
import { asArray, dateTime } from '../../lib/data';

export default function ReviewsMenu({ data }) {
  const value = dataOf(data.reviews, {});
  const items = [...asArray(value.branch_reviews), ...asArray(value.staff_reviews)];
  return <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Total reviews" value={value.summary?.total_reviews || 0} detail="Locations and staff" icon={Star} /><Metric label="Location rating" value={value.summary?.branch_average || 0} detail="Average customer rating" tone="peach" icon={Building2} /><Metric label="Five star" value={value.summary?.five_star || 0} detail="Top-rated reviews" tone="violet" icon={StarIcon} /></section><SimpleTable title="Customer reviews" description="Feedback collected for locations and professionals." items={items} emptyTitle="No reviews yet" columns={[
    { label: 'Customer', key: 'customer_name' }, { label: 'Rating', render: (item) => <span className="inline-flex items-center gap-1 font-medium"><Star className="size-4 fill-amber-400 text-amber-400" />{item.rating}</span> }, { label: 'Comment', key: 'comment' }, { label: 'Date', render: (item) => dateTime(item.created_at) },
  ]} /></div>;
}
