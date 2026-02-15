require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'
require 'action_view/railtie'
require 'action_cable/engine'
require 'active_job/railtie'
require 'rails/test_unit/railtie'

Bundler.require(*Rails.groups)

module Faultline
  class Application < Rails::Application
    config.load_defaults 8.0
    config.secret_key_base = AppConfig.secret_key_base

    # ActiveRecord encryption — keys derived from SECRET_KEY_BASE
    config.active_record.encryption.primary_key = OpenSSL::HMAC.hexdigest('SHA256', AppConfig.secret_key_base,
                                                                          'ar-primary-key')
    config.active_record.encryption.deterministic_key = OpenSSL::HMAC.hexdigest('SHA256', AppConfig.secret_key_base,
                                                                                'ar-deterministic-key')
    config.active_record.encryption.key_derivation_salt = OpenSSL::HMAC.hexdigest('SHA256', AppConfig.secret_key_base,
                                                                                  'ar-key-derivation-salt')
    config.active_record.encryption.support_unencrypted_data = true

    # ActionCable
    config.action_cable.mount_path = '/cable'

    # Use Sidekiq for ActiveJob
    config.active_job.queue_adapter = :sidekiq

    # Autoload paths
    config.autoload_paths << Rails.root.join('app/services')

    # CORS is handled by rack-cors initializer
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins AppConfig.cors_origin
        resource '*',
                 headers: :any,
                 methods: %i[get post put patch delete options head],
                 expose: %w[X-Renewed-Token],
                 credentials: true
      end
    end
  end
end
