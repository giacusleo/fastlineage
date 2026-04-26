{% docs account_tier_snapshot__description %}
Historized snapshot for the account domain; it preserves row-level change history over time.
{% enddocs %}

{% docs account_tier_snapshot__record_id %}
Primary grain identifier for the snapshot account asset.
{% enddocs %}

{% docs account_tier_snapshot__dbt_scd_id %}
dbt-generated surrogate key that identifies a versioned snapshot row.
{% enddocs %}

{% docs account_tier_snapshot__dbt_valid_from %}
Timestamp when the snapshot version became valid.
{% enddocs %}

{% docs account_tier_snapshot__dbt_valid_to %}
Timestamp when the snapshot version stopped being valid.
{% enddocs %}

{% docs account_tier_snapshot__updated_at %}
Source update timestamp used to detect a new snapshot version.
{% enddocs %}

{% docs account_tier_snapshot__status %}
Business status captured for the historized entity.
{% enddocs %}

{% docs account_tier_snapshot__semantic_group %}
Grouping label that clusters related values for consistent semantics.
{% enddocs %}
