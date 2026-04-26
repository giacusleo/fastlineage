{% docs payment_terms__description %}
Seed lookup table for the payment domain; it provides compact reference data for joins and labeling.
{% enddocs %}

{% docs payment_terms__record_id %}
Primary grain identifier for the seed payment asset.
{% enddocs %}

{% docs payment_terms__lookup_code %}
Normalized code used to map raw values to business categories.
{% enddocs %}

{% docs payment_terms__display_name %}
Human-readable label exposed to analysts and downstream marts.
{% enddocs %}

{% docs payment_terms__semantic_group %}
Grouping label that clusters related values for consistent semantics.
{% enddocs %}

{% docs payment_terms__is_active %}
Flag that indicates whether the row is currently active.
{% enddocs %}
