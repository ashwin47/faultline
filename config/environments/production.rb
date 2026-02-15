require 'active_support/core_ext/integer/time'

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false

  config.force_ssl = false
  config.assume_ssl = true

  config.log_tags = [:request_id]
  config.log_level = AppConfig.rails_log_level

  config.action_cable.disable_request_forgery_protection = true

  config.active_record.dump_schema_after_migration = false
end
