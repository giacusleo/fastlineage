select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_finance_general_ledger') }} as base
left join {{ ref('product_categories') }} as seed_map on 1 = 1
