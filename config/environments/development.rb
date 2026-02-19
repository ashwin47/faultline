require 'active_support/core_ext/integer/time'

Rails.application.configure do
  config.enable_reloading = true
  config.eager_load = false
  config.consider_all_requests_local = true

  # ActionCable
  config.action_cable.disable_request_forgery_protection = true

  # Cache store
  config.cache_store = :memory_store

  # Active Record
  config.active_record.migration_error = :page_load
  config.active_record.verbose_query_logs = true

  # Logger
  config.log_level = AppConfig.log_level
end
