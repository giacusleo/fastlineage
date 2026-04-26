select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_crm_accounts') }} as base
left join {{ ref('warehouse_capacity') }} as seed_map on 1 = 1
