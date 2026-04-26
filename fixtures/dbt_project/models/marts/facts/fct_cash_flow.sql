select
  'fct_cash_flow' as relation_name,
  'fact' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_finance_general_ledger_rollup') }} as base
left join {{ ref('int_finance_expenses_rollup') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('int_finance_budgets_rollup') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('currency_rates') }} as rel_3 on rel_3.record_id = base.record_id
left join {{ ref('fiscal_calendar') }} as rel_4 on rel_4.record_id = base.record_id
