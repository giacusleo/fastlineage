select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_app_feature_flags_hub') }} as base
left join {{ ref('int_app_events_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_billing_refunds') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('product_categories') }} as seed_map on 1 = 1
