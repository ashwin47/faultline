require 'active_support/core_ext/integer/time'

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = AppConfig.ci?
  config.consider_all_requests_local = true
  config.cache_store = :null_store
  config.action_cable.disable_request_forgery_protection = true
end
