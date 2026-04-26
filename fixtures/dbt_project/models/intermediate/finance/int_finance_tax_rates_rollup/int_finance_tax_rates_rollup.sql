select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_finance_tax_rates_hub') }} as base
left join {{ ref('int_finance_daily_fx_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_fulfillment_delivery_events') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('discount_bands') }} as seed_map on 1 = 1
