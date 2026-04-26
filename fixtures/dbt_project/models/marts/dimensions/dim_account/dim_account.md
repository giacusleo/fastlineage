{% docs dim_account__description %}
Dimension model for the account domain; it provides descriptive context for analytic joins.
{% enddocs %}

{% docs dim_account__record_id %}
Primary grain identifier for the dimension account asset.
{% enddocs %}

{% docs dim_account__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs dim_account__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs dim_account__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}

{% docs dim_account__dimension_key %}
Analytic key used to join the dimension row to facts.
{% enddocs %}
