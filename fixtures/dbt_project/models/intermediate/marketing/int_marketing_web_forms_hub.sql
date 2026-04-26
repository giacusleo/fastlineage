select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_marketing_web_forms') }} as base
left join {{ ref('stg_marketing_campaigns') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('warehouse_capacity') }} as seed_map on 1 = 1
