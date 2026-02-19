json.integrations @integrations

json.webhooks @webhooks do |webhook|
  json.integration webhook.integration
  json.integration_index webhook.integration_index
  json.url "/api/webhooks/#{webhook.integration}/#{webhook.token}"
end
