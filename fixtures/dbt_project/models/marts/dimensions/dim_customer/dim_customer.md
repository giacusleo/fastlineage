{% docs dim_customer__description %}
Dimension model for the customer domain; it provides descriptive context for analytic joins.
{% enddocs %}

{% docs dim_customer__record_id %}
Primary grain identifier for the dimension customer asset.
{% enddocs %}

{% docs dim_customer__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs dim_customer__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs dim_customer__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}

{% docs dim_customer__dimension_key %}
Analytic key used to join the dimension row to facts.
{% enddocs %}
