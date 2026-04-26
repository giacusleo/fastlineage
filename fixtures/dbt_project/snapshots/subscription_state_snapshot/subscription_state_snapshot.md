{% docs subscription_state_snapshot__description %}
Historized snapshot for the subscription domain; it preserves row-level change history over time.
{% enddocs %}

{% docs subscription_state_snapshot__record_id %}
Primary grain identifier for the snapshot subscription asset.
{% enddocs %}

{% docs subscription_state_snapshot__dbt_scd_id %}
dbt-generated surrogate key that identifies a versioned snapshot row.
{% enddocs %}

{% docs subscription_state_snapshot__dbt_valid_from %}
Timestamp when the snapshot version became valid.
{% enddocs %}

{% docs subscription_state_snapshot__dbt_valid_to %}
Timestamp when the snapshot version stopped being valid.
{% enddocs %}

{% docs subscription_state_snapshot__updated_at %}
Source update timestamp used to detect a new snapshot version.
{% enddocs %}

{% docs subscription_state_snapshot__status %}
Business status captured for the historized entity.
{% enddocs %}

{% docs subscription_state_snapshot__semantic_group %}
Grouping label that clusters related values for consistent semantics.
{% enddocs %}
