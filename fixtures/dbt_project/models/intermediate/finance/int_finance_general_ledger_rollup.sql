select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_finance_general_ledger_hub') }} as base
left join {{ ref('int_finance_expenses_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_fulfillment_shipments') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('product_categories') }} as seed_map on 1 = 1
