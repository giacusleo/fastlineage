select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_marketing_email_events') }} as base
left join {{ ref('stg_marketing_campaigns') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('region_targets') }} as seed_map on 1 = 1
